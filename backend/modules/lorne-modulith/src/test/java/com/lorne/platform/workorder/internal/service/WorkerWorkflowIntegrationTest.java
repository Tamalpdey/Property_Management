package com.lorne.platform.workorder.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionRequest;
import com.lorne.platform.fieldwork.internal.service.WorkerJobService;
import com.lorne.platform.fieldwork.internal.service.WorkerShiftClockService;
import com.lorne.platform.fieldwork.internal.service.WorkerLoginResolver;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.DailyInvoiceNumberGenerator;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkerWorkflowIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private static final Path MIGRATIONS = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
    private final UUID tenant = UUID.randomUUID(), user = UUID.randomUUID(), otherUser = UUID.randomUUID();
    private final UUID worker = UUID.randomUUID(), otherWorker = UUID.randomUUID(), order = UUID.randomUUID();
    private final UUID client = UUID.randomUUID(), property = UUID.randomUUID(), serviceType = UUID.randomUUID();
    private final UUID preStart = UUID.randomUUID(), completion = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private WorkerJobService jobs;
    private WorkOrderManagementService management;
    private AuditWriter audit;

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        try (var paths = Files.list(MIGRATIONS)) {
            for (var path : paths.filter(p -> p.getFileName().toString().matches("V\\d+__.*\\.sql"))
                    .sorted(Comparator.comparingInt(p -> Integer.parseInt(p.getFileName().toString().split("__")[0].substring(1))))
                    .toList()) {
                jdbc.execute(Files.readString(path));
            }
        }
        transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
        jdbc.update("INSERT INTO tenants(id,legal_name,display_name) VALUES (?, 'Test Services', 'Test Services')", tenant);
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, 'worker@example.com', 'Worker', 'ACTIVE'), (?, 'other@example.com', 'Other', 'ACTIVE')", user, otherUser);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'FIELD_WORKER'", tenant, user);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'FIELD_WORKER'", tenant, otherUser);
        jdbc.update("INSERT INTO workers(id,tenant_id,user_id,employee_number,display_name,email,status) VALUES (?, ?, ?, 'PT001', 'Worker', 'worker@example.com', 'ACTIVE'), (?, ?, ?, 'PT002', 'Other', 'other@example.com', 'ACTIVE')", worker, tenant, user, otherWorker, tenant, otherUser);
        jdbc.update("INSERT INTO customers(id,tenant_id,display_name,owner_code) VALUES (?, ?, 'Client', 'OWN-0001')", client, tenant);
        jdbc.update("INSERT INTO properties(id,tenant_id,customer_id,name,address_line1,city,property_code) VALUES (?, ?, ?, 'Club', '100 Richmond Street', 'Toronto', 'PRP-0001')", property, tenant, client);
        jdbc.update("INSERT INTO service_types(id,tenant_id,name) VALUES (?, ?, 'General Service')", serviceType, tenant);
        jdbc.update("INSERT INTO work_orders(id,tenant_id,customer_id,property_id,service_type_id,work_order_number,title,status) VALUES (?, ?, ?, ?, ?, '261012-0001', 'Service - Club', 'ASSIGNED')", order, tenant, client, property, serviceType);
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,work_order_id,worker_id) VALUES (?, ?, ?)", tenant, order, worker);
        jdbc.update("INSERT INTO work_order_tasks(id,tenant_id,work_order_id,label,checklist_phase) VALUES (?, ?, ?, 'Inspect site', 'PRE_START'), (?, ?, ?, 'Clean work area', 'COMPLETION')", preStart, tenant, order, completion, tenant, order);
        var mapper = new ObjectMapper().findAndRegisterModules();
        audit = new AuditWriter(jdbc, mapper);
        var documents = mock(DocumentStorageService.class);
        jobs = new WorkerJobService(jdbc, audit, documents, mock(WorkerShiftClockService.class), mapper, new WorkerLoginResolver(jdbc));
        management = new WorkOrderManagementService(jdbc, audit, mock(WorkOrderNumberGenerator.class), mock(OwnerNotificationOperations.class), documents, mapper, mock(WorkOrderTravelEstimateUpdater.class), mock(TenantSettingsOperations.class), mock(DailyInvoiceNumberGenerator.class));
    }

    @Test
    void completeFlowPreservesProgressAcrossAdminEditsAndEndsSubmitted() {
        var assignmentId = jdbc.queryForObject("SELECT id FROM work_order_assignments WHERE worker_id = ?", UUID.class, worker);
        action("START_TRAVEL", null);
        editAssignments(Set.of(worker));
        assertThat(state(worker)).isEqualTo("ACCEPTED");
        action("ARRIVE_ON_SITE", null);
        action("COMPLETE_CHECKLIST", preStart);
        action("START_WORK", null);
        editAssignments(Set.of(worker));
        assertThat(state(worker)).isEqualTo("IN_PROGRESS");
        action("COMPLETE_CHECKLIST", completion);
        action("COMPLETE_CHECKLIST", completion);
        afterPhoto(user);
        var response = action("COMPLETE_WORK", null);
        assertThat(response.job().assignmentStatus()).isEqualTo("COMPLETED");
        assertThat(response.job().status()).isEqualTo("PENDING_COMPLETION");
        editAssignments(Set.of(worker));
        assertThat(state(worker)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT id FROM work_order_assignments WHERE worker_id = ?", UUID.class, worker)).isEqualTo(assignmentId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM work_order_time_entries WHERE ended_at IS NULL", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action = 'WORKER_CHECKLIST_COMPLETED'", Integer.class)).isEqualTo(2);
    }

    @Test
    void anotherWorkersProgressDoesNotUnlockChecksOrAllowRepeatCompletion() {
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,work_order_id,worker_id) VALUES (?, ?, ?)", tenant, order, otherWorker);
        startWork();
        assertThatThrownBy(() -> otherAction("COMPLETE_CHECKLIST", completion)).isInstanceOf(BadRequestException.class).hasMessageContaining("Start or resume");
        action("COMPLETE_CHECKLIST", completion);
        afterPhoto(user);
        var submitted = action("COMPLETE_WORK", null);
        assertThat(submitted.job().assignmentStatus()).isEqualTo("COMPLETED");
        assertThat(submitted.job().status()).isEqualTo("IN_PROGRESS");
        editAssignments(Set.of(worker, otherWorker));
        assertThat(state(worker)).isEqualTo("COMPLETED");
        assertThat(state(otherWorker)).isEqualTo("ASSIGNED");
        assertThatThrownBy(() -> action("COMPLETE_CHECKLIST", completion)).hasMessageContaining("already closed");
        assertThatThrownBy(() -> action("START_TRAVEL", null)).hasMessageContaining("already closed");
        assertThatThrownBy(() -> action("COMPLETE_WORK", null)).hasMessageContaining("already closed");
        assertThatThrownBy(() -> transaction.execute(tx -> jobs.saveMaintenanceRecord(tenant, user, "worker@example.com", order, null)))
                .hasMessageContaining("already closed");
    }

    @Test
    void concurrentTeamSubmissionClosesBothAssignmentsAndLeavesOrderReadyForReview() throws Exception {
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,work_order_id,worker_id) VALUES (?, ?, ?)", tenant, order, otherWorker);
        startWork();
        otherAction("START_TRAVEL", null);
        otherAction("ARRIVE_ON_SITE", null);
        otherAction("START_WORK", null);
        action("COMPLETE_CHECKLIST", completion);
        afterPhoto(user);
        afterPhoto(otherUser);
        var ready = new java.util.concurrent.CountDownLatch(2);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var tasks = List.of(user, otherUser).stream().map(actor -> executor.submit(() -> transaction.execute(tx -> {
                ready.countDown();
                try { ready.await(5, java.util.concurrent.TimeUnit.SECONDS); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new RuntimeException(exception); }
                return jobs.applyAction(tenant, actor, actor.equals(user) ? "worker@example.com" : "other@example.com", order, request("COMPLETE_WORK", null));
            }))).toList();
            for (var task : tasks) assertThat(task.get(15, java.util.concurrent.TimeUnit.SECONDS).job().assignmentStatus()).isEqualTo("COMPLETED");
        }
        assertThat(jdbc.queryForObject("SELECT status::text FROM work_orders WHERE id = ?", String.class, order)).isEqualTo("PENDING_COMPLETION");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM work_order_time_entries WHERE ended_at IS NULL", Integer.class)).isZero();
    }

    @Test
    void checksAndTransitionsRequireCorrectPhaseAndResumeAfterPause() {
        assertThatThrownBy(() -> action("START_WORK", null)).hasMessageContaining("current worker progress");
        action("START_TRAVEL", null);
        action("ARRIVE_ON_SITE", null);
        assertThatThrownBy(() -> action("START_WORK", null)).hasMessageContaining("pre-start");
        action("COMPLETE_CHECKLIST", preStart);
        action("START_WORK", null);
        assertThatThrownBy(() -> action("START_TRAVEL", null)).hasMessageContaining("current worker progress");
        assertThatThrownBy(() -> action("COMPLETE_CHECKLIST", preStart)).hasMessageContaining("closed after work starts");
        assertThatThrownBy(() -> action("COMPLETE_WORK", null)).hasMessageContaining("completion checks");
        action("PAUSE_WORK", null);
        editAssignments(Set.of(worker));
        assertThat(state(worker)).isEqualTo("PAUSED");
        assertThatThrownBy(() -> action("COMPLETE_CHECKLIST", completion)).hasMessageContaining("Start or resume");
        action("RESUME_WORK", null);
        action("COMPLETE_CHECKLIST", completion);
        assertThatThrownBy(() -> action("COMPLETE_WORK", null)).hasMessageContaining("after photo");
    }

    @Test
    void pickupFlowKeepsPreStartChecksButDoesNotRequireServiceCompletionChecksOrPhoto() {
        jdbc.update("UPDATE work_orders SET work_order_type = 'PICKUP_DELIVERY' WHERE id = ?", order);
        action("START_TRAVEL", null);
        action("ARRIVE_ON_SITE", null);
        assertThatThrownBy(() -> action("START_WORK", null)).hasMessageContaining("pre-start");
        action("COMPLETE_CHECKLIST", preStart);
        action("START_WORK", null);
        assertThat(action("COMPLETE_WORK", null).job().status()).isEqualTo("PENDING_COMPLETION");
    }

    @Test
    void removingAssignmentPreservesHistoryAndCannotOrphanOpenTimeOrReopenClosedWorker() {
        startWork();
        assertThatThrownBy(() -> editAssignments(Set.of())).hasMessageContaining("Pause or end");
        assertThat(state(worker)).isEqualTo("IN_PROGRESS");
        action("PAUSE_WORK", null);
        var id = jdbc.queryForObject("SELECT id FROM work_order_assignments WHERE worker_id = ?", UUID.class, worker);
        editAssignments(Set.of());
        assertThat(state(worker)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("SELECT id FROM work_order_assignments WHERE worker_id = ?", UUID.class, worker)).isEqualTo(id);
        assertThatThrownBy(() -> editAssignments(Set.of(worker))).hasMessageContaining("explicit reassignment");
    }

    @Test
    void restoresProvenResetWithoutGivingNewWorkerSomebodyElsesProgress() throws Exception {
        startWork();
        simulateReset(worker, "IN_PROGRESS");
        audit.record(tenant, user, "WORK_ORDER_ASSIGNMENTS_UPDATED", "WORK_ORDER", order,
                Map.of("before", List.of(Map.of("workerId", worker.toString(), "assignmentStatus", "ASSIGNED", "leadWorker", false)),
                        "after", List.of(Map.of("workerId", worker.toString(), "assignmentStatus", "ASSIGNED", "leadWorker", true))));
        jdbc.update("INSERT INTO work_order_assignments(tenant_id,work_order_id,worker_id) VALUES (?, ?, ?)", tenant, order, otherWorker);
        migrateRepair();
        assertThat(state(worker)).isEqualTo("IN_PROGRESS");
        assertThat(state(otherWorker)).isEqualTo("ASSIGNED");
        action("COMPLETE_CHECKLIST", completion);
        afterPhoto(otherUser);
        assertThatThrownBy(() -> action("COMPLETE_WORK", null)).hasMessageContaining("after photo");
        afterPhoto(user);
        assertThat(action("COMPLETE_WORK", null).job().assignmentStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void restoresAccidentallyReopenedCompletionWithoutLosingAcceptedChecklistOrTime() throws Exception {
        startWork();
        action("COMPLETE_CHECKLIST", completion);
        afterPhoto(user);
        action("COMPLETE_WORK", null);
        simulateReset(worker, "COMPLETED");
        jdbc.update("UPDATE work_orders SET status = 'IN_PROGRESS' WHERE id = ?", order);
        migrateRepair();
        assertThat(state(worker)).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("SELECT status::text FROM work_orders WHERE id = ?", String.class, order)).isEqualTo("PENDING_COMPLETION");
        assertThat(jdbc.queryForObject("SELECT completed FROM work_order_tasks WHERE id = ?", Boolean.class, completion)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM work_order_time_entries WHERE ended_at IS NULL", Integer.class)).isZero();
        migrateRepair();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action = 'WORKER_ASSIGNMENT_PROGRESS_RESTORED'", Integer.class)).isEqualTo(1);
    }

    @Test
    void recoveryDoesNotUndoExplicitOverrideOrUnprovenReassignment() throws Exception {
        startWork();
        simulateReset(worker, "IN_PROGRESS");
        audit.record(tenant, user, "WORK_ORDER_FIELD_OVERRIDE_APPLIED", "WORK_ORDER", order, Map.of("reason", "Explicit correction"));
        migrateRepair();
        assertThat(state(worker)).isEqualTo("ASSIGNED");
        jdbc.update("DELETE FROM audit_logs WHERE action = 'WORK_ORDER_FIELD_OVERRIDE_APPLIED'");
        audit.record(tenant, user, "WORK_ORDER_ASSIGNMENTS_UPDATED", "WORK_ORDER", order,
                Map.of("before", List.of(Map.of("workerId", worker.toString(), "assignmentStatus", "RELEASED")), "after", List.of(Map.of("workerId", worker.toString(), "assignmentStatus", "ASSIGNED"))));
        migrateRepair();
        assertThat(state(worker)).isEqualTo("ASSIGNED");
    }

    private void startWork() {
        action("START_TRAVEL", null);
        action("ARRIVE_ON_SITE", null);
        action("COMPLETE_CHECKLIST", preStart);
        action("START_WORK", null);
    }

    private com.lorne.platform.fieldwork.internal.dto.WorkerJobActionResponse action(String action, UUID task) {
        return transaction.execute(tx -> jobs.applyAction(tenant, user, "worker@example.com", order, request(action, task)));
    }

    private void otherAction(String action, UUID task) {
        transaction.execute(tx -> jobs.applyAction(tenant, otherUser, "other@example.com", order, request(action, task)));
    }

    private WorkerJobActionRequest request(String action, UUID task) {
        return new WorkerJobActionRequest(action, null, null, task, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private void editAssignments(Set<UUID> selected) {
        var request = mock(CreateWorkOrderRequest.class);
        when(request.leadWorkerId()).thenReturn(selected.contains(worker) ? worker : null);
        transaction.executeWithoutResult(tx -> ReflectionTestUtils.invokeMethod(management, "replaceAssignments", tenant, order, user, request, selected));
    }

    private void afterPhoto(UUID actor) {
        var document = UUID.randomUUID();
        jdbc.update("INSERT INTO documents(id,tenant_id,owner_type,owner_id,bucket,object_key) VALUES (?, ?, 'WORK_ORDER', ?, 'test', ?)", document, tenant, order, document.toString());
        jdbc.update("INSERT INTO work_order_photos(tenant_id,work_order_id,document_id,photo_type,created_by) VALUES (?, ?, ?, 'AFTER', ?)", tenant, order, document, actor);
    }

    private String state(UUID workerId) {
        return jdbc.queryForObject("SELECT assignment_status::text FROM work_order_assignments WHERE work_order_id = ? AND worker_id = ?", String.class, order, workerId);
    }

    private void simulateReset(UUID workerId, String previous) {
        jdbc.update("UPDATE work_order_assignments SET assignment_status = 'ASSIGNED' WHERE worker_id = ?", workerId);
        audit.record(tenant, user, "WORK_ORDER_ASSIGNMENTS_UPDATED", "WORK_ORDER", order,
                Map.of("before", List.of(Map.of("workerId", workerId.toString(), "assignmentStatus", previous)), "after", List.of(Map.of("workerId", workerId.toString(), "assignmentStatus", "ASSIGNED"))));
    }

    private void migrateRepair() throws Exception {
        jdbc.execute(Files.readString(MIGRATIONS.resolve("V80__restore_reset_worker_assignment_progress.sql")));
    }
}
