package com.lorne.platform.superadmin.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.audit.internal.service.TenantAuditService;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class PlatformSupportIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private PlatformSupportService service;
    private AuditWriter audit;
    private TenantAuditService tenantAudit;
    private UUID tenant;
    private UUID other;
    private UUID actor;

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE"); jdbc.execute("CREATE SCHEMA public");
        var path = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
        try (var connection = ds.getConnection()) {
            for (var file : new String[]{"V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V4__customers_and_properties.sql", "V5__workers.sql", "V6__work_orders_and_schedule.sql", "V37__tenant_settings_branding_and_email.sql", "V82__platform_support_audit_indexes.sql", "V83__tenant_support_tickets.sql", "V84__tenant_access_audit_indexes.sql"}) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(path.resolve(file)));
            }
        }
        jdbc.execute("ALTER TABLE tenants ADD COLUMN portal_subdomain text");
        tenant = tenant("North Shore"); other = tenant("Other");
        actor = user(tenant, "TENANT_ADMIN", "ACTIVE");
        audit = new AuditWriter(jdbc, new ObjectMapper());
        service = new PlatformSupportService(jdbc, audit);
        tenantAudit = new TenantAuditService(jdbc, new ObjectMapper());
    }

    @Test
    void operationsCountsAreTenantScopedAndExcludeCancelledWorkAndInactiveResources() {
        var customer = jdbc.queryForObject("INSERT INTO customers(tenant_id,display_name) VALUES (?, 'Client') RETURNING id", UUID.class, tenant);
        var property = jdbc.queryForObject("INSERT INTO properties(tenant_id,customer_id,name,address_line1,city) VALUES (?, ?, 'Site','123 Street','Toronto') RETURNING id", UUID.class, tenant, customer);
        jdbc.update("INSERT INTO properties(tenant_id,customer_id,name,address_line1,city,active) VALUES (?, ?, 'Inactive site','456 Street','Toronto',false)", tenant, customer);
        jdbc.update("INSERT INTO workers(tenant_id,display_name,status) VALUES (?, 'Active','ACTIVE'), (?, 'Inactive','INACTIVE'), (?, 'Other tenant','ACTIVE')", tenant, tenant, other);
        for (var status : new String[]{"CREATED", "IN_PROGRESS", "COMPLETED", "APPROVED", "INVOICED", "CANCELLED"}) {
            jdbc.update("INSERT INTO work_orders(tenant_id,customer_id,property_id,title,status) VALUES (?, ?, ?, 'Job', ?::work_order_status)", tenant, customer, property, status);
        }
        jdbc.update("INSERT INTO support_tickets(tenant_id,subject,description,category,status) VALUES (?, 'Open','Details','OTHER','OPEN'), (?, 'Closed','Details','OTHER','CLOSED'), (?, 'Other','Details','OTHER','OPEN')", tenant, tenant, other);
        var lastLogin = Instant.parse("2026-10-14T12:00:00Z");
        jdbc.update("UPDATE app_users SET last_login_at = ?::timestamptz WHERE id = ?", lastLogin.toString(), actor);
        var overview = service.operations(tenant);
        assertThat(overview.properties()).isEqualTo(1);
        assertThat(overview.activeWorkers()).isEqualTo(1);
        assertThat(overview.openWorkOrders()).isEqualTo(2);
        assertThat(overview.completedWorkOrders()).isEqualTo(3);
        assertThat(overview.unresolvedTickets()).isEqualTo(1);
        assertThat(overview.resolvedTickets()).isEqualTo(1);
        assertThat(overview.lastLoginAt()).isEqualTo(lastLogin);
        assertThatThrownBy(() -> service.operations(UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void healthReportsMissingBackupAddressAndWorkerLoginWithoutLeakingSecrets() {
        jdbc.update("INSERT INTO tenant_settings(tenant_id,country_code,smtp_password) VALUES (?, 'CA', 'do-not-expose')", tenant);
        jdbc.update("INSERT INTO workers(tenant_id,display_name,status) VALUES (?, 'Unlinked worker', 'ACTIVE')", tenant);
        var report = service.health(tenant);
        assertThat(report.activeAdministrators()).isEqualTo(1);
        assertThat(report.workersWithoutLogin()).isEqualTo(1);
        assertThat(report.checks()).filteredOn(check -> check.code().equals("COMPANY_ADDRESS")).allSatisfy(check -> assertThat(check.severity()).isEqualTo("WARNING"));
        assertThat(report.toString()).doesNotContain("do-not-expose");
    }

    @Test
    void orphanedTenantIsCriticalAndInactiveOrOtherTenantAdminsDoNotCount() {
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", actor);
        user(other, "TENANT_ADMIN", "ACTIVE");
        var report = service.health(tenant);
        assertThat(report.activeAdministrators()).isZero();
        assertThat(report.checks()).filteredOn(check -> check.code().equals("ADMIN_ACCESS")).allSatisfy(check -> assertThat(check.severity()).isEqualTo("CRITICAL"));
    }

    @Test
    void fullyConfiguredTenantAndWorkerShowPassingChecks() {
        user(tenant, "TENANT_ADMIN", "ACTIVE");
        var worker = user(tenant, "FIELD_WORKER", "ACTIVE");
        jdbc.update("INSERT INTO workers(tenant_id,user_id,display_name,status) VALUES (?, ?, 'Worker', 'ACTIVE')", tenant, worker);
        jdbc.update("INSERT INTO tenant_settings(tenant_id,logo_url,billing_email,phone,address_line1,city,country_code) VALUES (?, 'logo.png','billing@example.com','4165551234','123 Street','Toronto','CA')", tenant);
        assertThat(service.health(tenant).checks()).allSatisfy(check -> assertThat(check.severity()).isEqualTo("PASS"));
    }

    @Test
    void notesArePrivateEvenWhenTenantAuditExplicitlyRequestsTheirResourceType() {
        service.addNote(tenant, actor, "Private support investigation");
        audit.record(tenant, actor, "SUPERADMIN_USER_ACCESS_UPDATED", "PLATFORM_ACCESS", actor, Map.of("reason", "Private recovery justification"));
        audit.record(tenant, actor, "TENANT_USER_UPDATED", "USER", actor, Map.of("visible", true));
        assertThat(tenantAudit.list(tenant, 100, null, null)).extracting(entry -> entry.action()).containsExactly("TENANT_USER_UPDATED");
        assertThat(tenantAudit.list(tenant, 100, "PLATFORM_SUPPORT", tenant)).isEmpty();
        assertThat(tenantAudit.list(tenant, 100, "PLATFORM_ACCESS", actor)).isEmpty();
        assertThat(service.audit(tenant, "", null, null, 0, 25).total()).isEqualTo(2);
    }

    @Test
    void supportNotesAreTenantScopedAndPreserveLiteralText() {
        service.addNote(tenant, actor, "  <script>not executed</script>\nSecond line  ");
        service.addNote(other, actor, "Other tenant's note");
        var notes = service.notes(tenant);
        assertThat(notes).hasSize(1);
        assertThat(notes.getFirst().note()).isEqualTo("<script>not executed</script>\nSecond line");
        assertThat(notes.getFirst().actorName()).isEqualTo("User");
    }

    @Test
    void auditSearchSupportsTenantReasonActorDateAndStablePagination() {
        for (var i = 0; i < 4; i++) audit.record(tenant, actor, "SUPERADMIN_USER_ACCESS_UPDATED", "PLATFORM_ACCESS", actor,
                Map.of("reason", "Recovery case " + i, "userEmail", "owner@example.com", "roles", java.util.List.of("TENANT_ADMIN")));
        audit.record(other, actor, "TENANT_UPDATED", "TENANT", other, Map.of());
        var first = service.audit(tenant, "owner@example.com", Instant.now().minusSeconds(100), Instant.now().plusSeconds(100), 0, 2);
        var second = service.audit(tenant, "Recovery", null, null, 1, 2);
        assertThat(first.total()).isEqualTo(4);
        assertThat(first.items()).hasSize(2);
        assertThat(second.items()).hasSize(2);
        assertThat(first.items()).extracting(entry -> entry.id()).doesNotContainAnyElementsOf(second.items().stream().map(entry -> entry.id()).toList());
        assertThat(first.items().getFirst().detail()).contains("owner@example.com", "TENANT_ADMIN", "Recovery");
        assertThat(service.audit(null, "User", null, null, 0, 25).total()).isEqualTo(5);
    }

    @Test
    void searchTreatsWildcardCharactersAsLiteralAndDoesNotExposeWorkOrderAudit() {
        service.addNote(tenant, actor, "Customer requested 10% adjustment");
        audit.record(tenant, actor, "WORK_ORDER_UPDATED", "WORK_ORDER", UUID.randomUUID(), Map.of("private", "Customer work details"));
        assertThat(service.audit(null, "%", null, null, 0, 25).total()).isEqualTo(1);
        assertThat(service.audit(null, "_", null, null, 0, 25).total()).isEqualTo(1); // Action contains literal underscores.
        assertThat(service.audit(null, "Customer work details", null, null, 0, 25).items()).isEmpty();
        assertThat(service.audit(null, "' OR 1=1 --", null, null, 0, 25).items()).isEmpty();
    }

    @Test
    void rejectsInvalidNotesDatesPaginationAndMissingTenants() {
        assertThatThrownBy(() -> service.addNote(tenant, actor, "  ")).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.addNote(tenant, actor, "x".repeat(4001))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.audit(null, null, null, null, -1, 25)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.audit(null, null, null, null, 0, 101)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.audit(null, null, Instant.now(), Instant.now().minusSeconds(1), 0, 25)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.health(UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.notes(UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
    }

    private UUID tenant(String name) {
        return jdbc.queryForObject("INSERT INTO tenants(legal_name,display_name,status,portal_subdomain) VALUES (?, ?, 'ACTIVE', 'north-shore') RETURNING id", UUID.class, name, name);
    }
    private UUID user(UUID tenantId, String role, String status) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, ?, 'User', ?::user_status)", id, id + "@example.com", status);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = ?", tenantId, id, role);
        return id;
    }
}
