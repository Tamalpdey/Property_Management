package com.lorne.platform.worker.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import com.lorne.platform.worker.internal.dto.CreateWorkerRequest;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.DuplicateResourceException;

@Testcontainers(disabledWithoutDocker = true)
class WorkerEmailIntegrityIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private final UUID tenant = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private final UUID login = UUID.randomUUID();
    private UUID retained;
    private UUID duplicate;
    private final UUID job = UUID.randomUUID();
    private final UUID history = UUID.randomUUID();
    private static final Path MIGRATIONS = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        try (var connection = ds.getConnection()) {
            for (var file : new String[]{"V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V5__workers.sql"}) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(MIGRATIONS.resolve(file)));
            }
        }
        jdbc.update("INSERT INTO tenants(id,legal_name,display_name) VALUES (?, 'Services', 'Services')", tenant);
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, 'admin@example.com', 'Administrator', 'ACTIVE'), (?, 'worker@example.com', 'Worker', 'ACTIVE')", actor, login);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'TENANT_ADMIN'", tenant, actor);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'FIELD_WORKER'", tenant, login);
        retained = worker(tenant, login, "Pt0012", "ACTIVE", "worker@example.com");
        duplicate = worker(tenant, null, "PT002", "INACTIVE", "worker@example.com");
        jdbc.execute(Files.readString(MIGRATIONS.resolve("V78__prevent_duplicate_worker_emails.sql")));
        jdbc.execute("CREATE TABLE work_orders(id uuid PRIMARY KEY, tenant_id uuid REFERENCES tenants(id), status work_order_status, service_type_id uuid)");
        jdbc.execute("CREATE TABLE worker_service_skills(tenant_id uuid, worker_id uuid REFERENCES workers(id), service_type_id uuid)");
        jdbc.execute("CREATE TABLE work_order_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, work_order_id uuid REFERENCES work_orders(id), worker_id uuid REFERENCES workers(id), lead_worker boolean DEFAULT false, assignment_status text DEFAULT 'ASSIGNED', released_at timestamptz, release_reason text, updated_at timestamptz DEFAULT now(), created_by uuid, updated_by uuid, UNIQUE(tenant_id,work_order_id,worker_id))");
        jdbc.execute("CREATE TABLE work_order_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, work_order_id uuid REFERENCES work_orders(id), assigned_worker_id uuid REFERENCES workers(id), task_status text, updated_by uuid, updated_at timestamptz)");
        jdbc.execute("CREATE TABLE work_order_time_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, worker_id uuid REFERENCES workers(id), ended_at timestamptz)");
        jdbc.execute("CREATE TABLE worker_shift_clock_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, worker_id uuid REFERENCES workers(id), ended_at timestamptz)");
        jdbc.update("INSERT INTO work_orders(id,tenant_id,status) VALUES (?, ?, 'IN_PROGRESS'), (?, ?, 'COMPLETED')", job, tenant, history, tenant);
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,work_order_id,worker_id,assignment_status,lead_worker) VALUES (?, ?, ?, 'ASSIGNED', true), (?, ?, ?, 'COMPLETED', false)", tenant, job, duplicate, tenant, history, duplicate);
        jdbc.update("INSERT INTO work_order_tasks(tenant_id,work_order_id,assigned_worker_id,task_status) VALUES (?, ?, ?, 'TO_DO'), (?, ?, ?, 'COMPLETED')", tenant, job, duplicate, tenant, history, duplicate);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
    }

    @Test
    void rejectsNewDuplicateEmailsIncludingInactiveProfilesCaseAndWhitespace() {
        assertThatThrownBy(() -> worker(tenant, null, "PT020", "ACTIVE", " Worker@Example.COM ")).isInstanceOf(DuplicateKeyException.class);
        assertThatThrownBy(() -> worker(tenant, null, "PT021", "INACTIVE", "worker@example.com")).isInstanceOf(DuplicateKeyException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers", Integer.class)).isEqualTo(2);
    }

    @Test
    void workerCreationReportsDuplicateBeforeWritingAnExtraProfile() {
        var service = new WorkerManagementService(jdbc, org.mockito.Mockito.mock(AuditWriter.class));
        var request = new CreateWorkerRequest("PT020", "Worker", null, "WORKER@EXAMPLE.COM", "FULL_TIME", null, null, null, null, java.util.List.of(), java.util.List.of(), java.util.List.of());
        assertThatThrownBy(() -> service.create(tenant, actor, request)).isInstanceOf(DuplicateResourceException.class).hasMessageContaining("existing profile");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers", Integer.class)).isEqualTo(2);
    }

    @Test
    void legacyDuplicateCannotBeReactivatedBeforeResolution() {
        assertThatThrownBy(() -> jdbc.update("UPDATE workers SET status = 'ACTIVE' WHERE id = ?", duplicate)).isInstanceOf(DuplicateKeyException.class);
        assertThat(jdbc.queryForObject("SELECT status::text FROM workers WHERE id = ?", String.class, duplicate)).isEqualTo("INACTIVE");
    }

    @Test
    void allowsSameEmailForDifferentTenantsAndMultipleEmptyEmails() {
        var otherTenant = UUID.randomUUID();
        jdbc.update("INSERT INTO tenants(id,legal_name,display_name) VALUES (?, 'Other', 'Other')", otherTenant);
        worker(otherTenant, null, "PT001", "ACTIVE", "worker@example.com");
        worker(tenant, null, "PT020", "ACTIVE", null);
        worker(tenant, null, "PT021", "ACTIVE", " ");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers WHERE email IS NULL", Integer.class)).isEqualTo(2);
    }

    @Test
    void installsWithoutRewritingLegacyDuplicatesAndAllowsUnrelatedEdits() {
        jdbc.update("UPDATE workers SET display_name = 'Updated Worker', email = email WHERE id = ?", retained);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers WHERE email = 'worker@example.com'", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT status::text FROM workers WHERE id = ?", String.class, duplicate)).isEqualTo("INACTIVE");
    }

    @Test
    void repairRetainsPt012LoginAndPreservesHistoricalAssignmentsAndTasks() throws Exception {
        repair();
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments WHERE work_order_id = ? AND assignment_status = 'ASSIGNED'", UUID.class, job)).isEqualTo(retained);
        assertThat(jdbc.queryForObject("SELECT assignment_status FROM work_order_assignments WHERE work_order_id = ? AND worker_id = ?", String.class, job, duplicate)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments WHERE work_order_id = ?", UUID.class, history)).isEqualTo(duplicate);
        assertThat(jdbc.queryForObject("SELECT assigned_worker_id FROM work_order_tasks WHERE work_order_id = ?", UUID.class, history)).isEqualTo(duplicate);
        assertThat(jdbc.queryForObject("SELECT assigned_worker_id FROM work_order_tasks WHERE work_order_id = ?", UUID.class, job)).isEqualTo(retained);
        assertThat(jdbc.queryForObject("SELECT user_id FROM workers WHERE id = ?", UUID.class, retained)).isEqualTo(login);
        assertThat(jdbc.queryForObject("SELECT employee_number FROM workers WHERE id = ?", String.class, retained)).isEqualTo("Pt0012");
        assertThat(jdbc.queryForObject("SELECT email FROM workers WHERE id = ?", String.class, duplicate)).isNull();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT metadata->>'historicalRecordsPreserved' FROM audit_logs", String.class)).isEqualTo("true");
    }

    @Test
    void repairRefusesInProgressAssignmentWithoutMutatingEitherProfile() {
        jdbc.update("UPDATE work_order_assignments SET assignment_status = 'IN_PROGRESS' WHERE work_order_id = ?", job);
        assertThatThrownBy(this::repair).hasMessageContaining("manual review");
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments WHERE work_order_id = ?", UUID.class, job)).isEqualTo(duplicate);
        assertThat(jdbc.queryForObject("SELECT email FROM workers WHERE id = ?", String.class, duplicate)).isEqualTo("worker@example.com");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs", Integer.class)).isZero();
    }

    @Test
    void repairRefusesUnfinishedTimeRecords() {
        jdbc.update("INSERT INTO work_order_time_entries(tenant_id,worker_id) VALUES (?, ?)", tenant, duplicate);
        assertThatThrownBy(this::repair).hasMessageContaining("manual review");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM work_order_assignments WHERE worker_id = ?", Integer.class, retained)).isZero();
    }

    @Test
    void repairDoesNotBypassWorkerServiceQualifications() {
        jdbc.update("UPDATE work_orders SET service_type_id = ? WHERE id = ?", UUID.randomUUID(), job);
        assertThatThrownBy(this::repair).hasMessageContaining("qualified for the service");
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments WHERE work_order_id = ?", UUID.class, job)).isEqualTo(duplicate);
    }

    @Test
    void serializesConcurrentAttemptsToCreateTheSameEmail() throws Exception {
        var ready = new java.util.concurrent.CountDownLatch(2);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var tasks = java.util.stream.IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                try {
                    return transaction.execute(tx -> {
                        ready.countDown();
                        try { ready.await(5, java.util.concurrent.TimeUnit.SECONDS); }
                        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new RuntimeException(e); }
                        worker(tenant, null, "C" + i, "ACTIVE", "concurrent@example.com");
                        return true;
                    });
                } catch (DuplicateKeyException e) { return false; }
            })).toList();
            var successes = 0;
            for (var task : tasks) if (task.get(10, java.util.concurrent.TimeUnit.SECONDS)) successes++;
            assertThat(successes).isEqualTo(1);
        }
    }

    private UUID worker(UUID tenantId, UUID userId, String code, String status, String email) {
        return jdbc.queryForObject("INSERT INTO workers(tenant_id,user_id,employee_number,display_name,email,status) VALUES (?, ?, ?, 'Worker', ?, ?::worker_status) RETURNING id", UUID.class, tenantId, userId, code, email, status);
    }

    private void repair() throws Exception {
        var script = Files.readString(Path.of("../../../db-migration/support/repair_duplicate_worker_assignment.sql"))
                .replace("BEGIN;\n", "").replace("\nROLLBACK;", "");
        transaction.executeWithoutResult(tx -> {
            setting("work_order_id", job.toString()); setting("worker_email", "worker@example.com");
            setting("retained_employee_number", "PT012"); setting("duplicate_employee_number", "PT002");
            setting("actor_user_id", actor.toString()); jdbc.execute(script);
        });
    }

    private void setting(String key, String value) {
        jdbc.queryForObject("SELECT set_config(?, ?, true)", String.class, "lorne.repair." + key, value);
    }
}
