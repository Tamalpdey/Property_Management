package com.lorne.platform.auth.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.auth.internal.dto.CreateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.UpdateTenantUserRequest;
import com.lorne.platform.fieldwork.internal.service.WorkerLoginResolver;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkerLoginLinkIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private TenantUserManagementService users;
    private WorkerLoginResolver resolver;
    private final UUID tenant = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private final String email = "worker@example.com";

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
        try (var connection = ds.getConnection()) {
            for (var file : new String[]{"V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V5__workers.sql"}) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve(file)));
            }
        }
        jdbc.execute("ALTER TABLE app_users ADD COLUMN profile_photo_url text");
        jdbc.execute("CREATE TABLE work_order_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), worker_id uuid REFERENCES workers(id), work_order_number text)");
        jdbc.update("INSERT INTO tenants(id,legal_name,display_name) VALUES (?, 'Services', 'Services')", tenant);
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, 'admin@example.com', 'Administrator', 'ACTIVE')", actor);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'TENANT_ADMIN'", tenant, actor);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
        users = new TenantUserManagementService(jdbc, new BCryptPasswordEncoder(4), new AuditWriter(jdbc, new ObjectMapper()));
        resolver = new WorkerLoginResolver(jdbc);
    }

    @Test
    void creatingLoginReusesAssignedWorkerWithMatchingEmail() {
        var worker = worker(null, "ACTIVE", email);
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,worker_id,work_order_number) VALUES (?, ?, '261012-0001')", tenant, worker);
        var user = transaction.execute(tx -> users.create(tenant, actor, request(null)));
        assertThat(user.workerId()).isEqualTo(worker);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers", Integer.class)).isEqualTo(1);
        assertThat(resolver.activeWorker(tenant, user.id(), email).id()).isEqualTo(worker);
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments WHERE work_order_number = '261012-0001'", UUID.class)).isEqualTo(worker);
    }

    @Test
    void inactiveExistingWorkerIsNotSilentlyDuplicatedOrReactivated() {
        var worker = worker(null, "INACTIVE", email);
        var user = transaction.execute(tx -> users.create(tenant, actor, request(null)));
        assertThat(user.workerId()).isEqualTo(worker);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM workers", Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> resolver.activeWorker(tenant, user.id(), email)).isInstanceOf(BadRequestException.class).hasMessageContaining("inactive").hasMessageContaining("activate this existing profile");
    }

    @Test
    void duplicateEmailsRequireExplicitSelectionAndRollBackUserCreation() {
        var first = worker(null, "ACTIVE", email);
        worker(null, "ACTIVE", email);
        assertThatThrownBy(() -> transaction.execute(tx -> users.create(tenant, actor, request(null))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("More than one worker profile");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_users WHERE email = ?", Integer.class, email)).isZero();
        var user = transaction.execute(tx -> users.create(tenant, actor, request(first)));
        assertThat(resolver.activeWorker(tenant, user.id(), email).id()).isEqualTo(first);
    }

    @Test
    void linkedInactiveProfileCannotFallBackToAnotherActiveProfile() {
        var user = transaction.execute(tx -> users.create(tenant, actor, request(null)));
        jdbc.update("UPDATE workers SET status = 'ON_LEAVE' WHERE id = ?", user.workerId());
        worker(null, "ACTIVE", email);
        assertThatThrownBy(() -> resolver.activeWorker(tenant, user.id(), email)).hasMessageContaining("on leave");
    }

    @Test
    void sameEmailCannotGrantAccessToOtherLoginOrTenant() {
        var user = transaction.execute(tx -> users.create(tenant, actor, request(null)));
        assertThatThrownBy(() -> resolver.activeWorker(tenant, UUID.randomUUID(), email)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> resolver.activeWorker(UUID.randomUUID(), user.id(), email)).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void administratorCanRelinkExistingLoginToPreviouslyAssignedProfile() {
        var user = transaction.execute(tx -> users.create(tenant, actor, request(null)));
        var assignedWorker = worker(null, "ACTIVE", email);
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,worker_id,work_order_number) VALUES (?, ?, '261012-0001')", tenant, assignedWorker);
        var updated = transaction.execute(tx -> users.update(tenant, actor, user.id(), new UpdateTenantUserRequest("Worker", null, email, null, null, List.of("FIELD_WORKER"), assignedWorker)));
        assertThat(updated.workerId()).isEqualTo(assignedWorker);
        assertThat(resolver.activeWorker(tenant, user.id(), email).id()).isEqualTo(assignedWorker);
        assertThat(jdbc.queryForObject("SELECT user_id FROM workers WHERE id = ?", UUID.class, user.workerId())).isNull();
        assertThat(jdbc.queryForObject("SELECT worker_id FROM work_order_assignments", UUID.class)).isEqualTo(assignedWorker);
    }

    @Test
    void unlinkedLegacyProfileCanBeFoundByNormalizedEmail() {
        var worker = worker(null, "ACTIVE", " Worker@Example.com ");
        assertThat(resolver.activeWorker(tenant, UUID.randomUUID(), email).id()).isEqualTo(worker);
    }

    private UUID worker(UUID userId, String status, String email) {
        return jdbc.queryForObject("INSERT INTO workers(tenant_id,user_id,display_name,email,status) VALUES (?, ?, 'Worker', ?, ?::worker_status) RETURNING id", UUID.class, tenant, userId, email, status);
    }

    private CreateTenantUserRequest request(UUID workerId) {
        return new CreateTenantUserRequest("Worker", null, email, null, "Password123!", List.of("FIELD_WORKER"), workerId);
    }
}
