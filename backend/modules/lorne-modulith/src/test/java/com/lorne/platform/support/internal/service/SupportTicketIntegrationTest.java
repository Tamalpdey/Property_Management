package com.lorne.platform.support.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.audit.internal.service.TenantAuditService;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ConflictException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.Create;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.Update;
import com.lorne.platform.superadmin.internal.service.SuperAdminOverviewService;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class SupportTicketIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private SupportTicketService service;
    private TransactionTemplate tx;
    private UUID tenant; private UUID other; private UUID operator; private UUID outsider; private UUID agent;

    @BeforeEach void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds); jdbc.execute("DROP SCHEMA public CASCADE"); jdbc.execute("CREATE SCHEMA public");
        var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
        try (var connection = ds.getConnection()) {
            for (var file : List.of("V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V83__tenant_support_tickets.sql", "V84__tenant_access_audit_indexes.sql")) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve(file)));
            }
        }
        jdbc.execute("ALTER TABLE tenants ADD COLUMN portal_subdomain text");
        tenant = tenant("Tenant A", "ACTIVE"); other = tenant("Tenant B", "TRIAL");
        operator = user(tenant, "OPERATIONS"); outsider = user(other, "TENANT_ADMIN"); agent = user(null, "SUPER_ADMIN");
        service = new SupportTicketService(jdbc, new AuditWriter(jdbc, new ObjectMapper()));
        tx = new TransactionTemplate(new DataSourceTransactionManager(ds));
    }

    @Test void tenantCreatesIndependentTicketAndFiltersStayTenantScoped() {
        var created = create();
        tx.execute(t -> service.create(other, outsider, new Create("Other tenant issue", "Description", "OTHER", "HIGH")));
        assertThat(created.ticket().number()).isEqualTo("SUP-000001");
        assertThat(created.ticket().status()).isEqualTo("OPEN");
        assertThat(service.list(tenant, "UNRESOLVED", null, "SUP-000001", 0, 25).items()).hasSize(1);
        assertThat(service.list(tenant, null, null, "Other tenant", 0, 25).total()).isZero();
        assertThat(service.list(null, null, null, null, 0, 25).total()).isEqualTo(2);
    }

    @Test void foreignTicketIdsCannotBeReadRepliedToOrClosed() {
        var id = create().ticket().id();
        assertThatThrownBy(() -> service.detail(other, id, false)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> tx.execute(t -> service.reply(other, outsider, id, "Attempted reply", false, false))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> tx.execute(t -> service.close(other, outsider, id, 0))).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> service.detail(null, id, false)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void internalNotesAreNeverReturnedInTenantConversationsOrTenantAudit() {
        var id = create().ticket().id();
        tx.execute(t -> service.reply(null, agent, id, "Private investigation details", true, true));
        tx.execute(t -> service.reply(null, agent, id, "Public response", true, false));
        var tenantView = service.detail(tenant, id, false);
        assertThat(tenantView.messages()).extracting(message -> message.body()).containsExactly("Public response");
        assertThat(service.detail(null, id, true).messages()).hasSize(2);
        var audit = new TenantAuditService(jdbc, new ObjectMapper()).list(tenant, 100, null, null);
        assertThat(audit).noneMatch(event -> event.action().equals("SUPPORT_INTERNAL_NOTE_ADDED"));
        assertThat(audit.toString()).doesNotContain("Private investigation details");
        assertThatThrownBy(() -> tx.execute(t -> service.reply(tenant, operator, id, "Cannot write private notes", false, true))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void assignmentMustBeToAnActiveGlobalPlatformAdmin() {
        var id = create().ticket().id();
        assertThatThrownBy(() -> tx.execute(t -> service.update(agent, id, new Update("IN_PROGRESS", "HIGH", outsider, 0)))).isInstanceOf(BadRequestException.class);
        var updated = tx.execute(t -> service.update(agent, id, new Update("IN_PROGRESS", "URGENT", agent, 0)));
        assertThat(updated.ticket().assignedTo()).isEqualTo(agent);
        assertThat(updated.ticket().priority()).isEqualTo("URGENT");
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", agent);
        assertThat(service.agents()).isEmpty();
        assertThatThrownBy(() -> tx.execute(t -> service.update(agent, id, new Update("RESOLVED", "URGENT", null, 1)))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void staleAgentUpdateIsRejectedAfterAnotherReply() {
        var id = create().ticket().id();
        tx.execute(t -> service.reply(tenant, operator, id, "Additional context", false, false));
        assertThatThrownBy(() -> tx.execute(t -> service.update(agent, id, new Update("RESOLVED", "NORMAL", agent, 0)))).isInstanceOf(ConflictException.class);
        assertThat(service.detail(tenant, id, false).ticket().status()).isEqualTo("OPEN");
        assertThatThrownBy(() -> tx.execute(t -> service.close(tenant, operator, id, 0))).isInstanceOf(ConflictException.class);
    }

    @Test void customerReplyReopensResolvedClosedAndWaitingTicketsWithoutLosingAssignment() {
        var id = create().ticket().id();
        for (var status : List.of("WAITING_ON_TENANT", "RESOLVED", "CLOSED")) {
            var current = service.detail(tenant, id, false).ticket();
            tx.execute(t -> service.update(agent, id, new Update(status, "NORMAL", agent, current.version())));
            var reply = tx.execute(t -> service.reply(tenant, operator, id, "Please continue assisting", false, false));
            assertThat(reply.ticket().status()).isEqualTo("OPEN");
            assertThat(reply.ticket().resolvedAt()).isNull();
            assertThat(reply.ticket().assignedTo()).isEqualTo(agent);
        }
    }

    @Test void tenantCanCloseAndReplyToReopenAndActiveConversationRemainsInProgress() {
        var id = create().ticket().id();
        var closed = tx.execute(t -> service.close(tenant, operator, id, 0));
        assertThat(closed.ticket().status()).isEqualTo("CLOSED");
        assertThat(closed.ticket().resolvedAt()).isNotNull();
        tx.execute(t -> service.reply(tenant, operator, id, "Reopen please", false, false));
        tx.execute(t -> service.reply(null, agent, id, "We are investigating", true, false));
        var reply = tx.execute(t -> service.reply(tenant, operator, id, "Thank you", false, false));
        assertThat(reply.ticket().status()).isEqualTo("IN_PROGRESS");
    }

    @Test void suspendedTenantCannotCreateOrReplyAndPlatformCanStillInvestigate() {
        var id = create().ticket().id();
        jdbc.update("UPDATE tenants SET status = 'SUSPENDED' WHERE id = ?", tenant);
        assertThatThrownBy(this::create).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tx.execute(t -> service.reply(tenant, operator, id, "Cannot access", false, false))).isInstanceOf(AccessDeniedException.class);
        assertThat(service.detail(null, id, true).ticket().id()).isEqualTo(id);
    }

    @Test void rejectsUnsupportedEnumsBlankTextAndInvalidPagination() {
        assertThatThrownBy(() -> tx.execute(t -> service.create(tenant, operator, new Create(" ", "Text", "BUG", "NORMAL")))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> tx.execute(t -> service.create(tenant, operator, new Create("Title", "Text", "UNKNOWN", "NORMAL")))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.list(tenant, "UNKNOWN", null, null, 0, 25)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.list(tenant, null, null, null, -1, 25)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> tx.execute(t -> service.create(null, agent, new Create("Title", "Text", "BUG", "NORMAL")))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void dashboardCountsStatusesAndSupportWorkloadInsteadOfMoney() {
        create();
        var second = tx.execute(t -> service.create(tenant, operator, new Create("Urgent login", "Cannot access", "ACCESS", "URGENT")));
        tx.execute(t -> service.update(agent, second.ticket().id(), new Update("WAITING_ON_TENANT", "URGENT", agent, 0)));
        tenant("Inactive tenant", "SUSPENDED"); tenant("Cancelled tenant", "CANCELLED"); tenant("Account review", "PAST_DUE");
        var result = new SuperAdminOverviewService(jdbc).overview();
        assertThat(result.metrics()).extracting(metric -> metric.label()).containsExactly("Total tenants", "Access enabled", "Inactive tenants", "Unresolved tickets");
        assertThat(result.metrics()).extracting(metric -> metric.value()).containsExactly("5", "3", "2", "2");
        assertThat(result.tenantStatuses()).hasSize(5);
        assertThat(result.support().urgent()).isEqualTo(1);
        assertThat(result.support().unassigned()).isEqualTo(1);
        assertThat(result.tenantHealth()).filteredOn(row -> row.id().equals(tenant)).allSatisfy(row -> assertThat(row.openTickets()).isEqualTo(2));
    }

    private com.lorne.platform.support.internal.dto.SupportTicketDtos.Detail create() {
        return tx.execute(t -> service.create(tenant, operator, new Create("Cannot complete a checklist", "Please review this issue.", "WORK_ORDERS", "NORMAL")));
    }
    private UUID tenant(String name, String status) {
        return jdbc.queryForObject("INSERT INTO tenants(legal_name,display_name,status,portal_subdomain) VALUES (?, ?, ?::tenant_status, 'tenant') RETURNING id", UUID.class, name, name, status);
    }
    private UUID user(UUID tenantId, String role) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, ?, 'User', 'ACTIVE')", id, id + "@example.com");
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = ?", tenantId, id, role);
        return id;
    }
}
