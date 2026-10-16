package com.lorne.platform.auth.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.auth.internal.dto.CreateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.UpdateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.UpdateTenantPortalAccessRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class TenantAdministratorIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private TenantUserManagementService users;
    private UUID tenant;
    private UUID admin;

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
        try (var connection = ds.getConnection()) {
            for (var file : new String[]{"V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V5__workers.sql", "V29__auth_refresh_sessions.sql"}) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve(file)));
            }
        }
        jdbc.execute("ALTER TABLE app_users ADD COLUMN profile_photo_url text");
        tenant = tenant();
        admin = user(tenant, "ACTIVE", "TENANT_ADMIN");
        transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
        users = new TenantUserManagementService(jdbc, new BCryptPasswordEncoder(4), new AuditWriter(jdbc, new ObjectMapper()));
    }

    @Test
    void soleAdministratorCannotBeDemotedAndFailureRollsBackProfileAndAudit() {
        assertThatThrownBy(() -> transaction.execute(tx -> users.update(tenant, admin, admin, update(admin, "OPERATIONS"))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one active Tenant Admin");
        assertThat(activeAdmins(tenant)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, admin)).isEqualTo("User");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs", Integer.class)).isZero();
    }

    @Test
    void emailUpsertCannotBypassLastAdministratorGuard() {
        var request = new CreateTenantUserRequest("Changed", null, email(admin), null, "Password123!", List.of("OPERATIONS"), null);
        assertThatThrownBy(() -> transaction.execute(tx -> users.create(tenant, admin, request)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one active Tenant Admin");
        assertThat(activeAdmins(tenant)).isEqualTo(1);
    }

    @Test
    void disabledInvitedAndOtherTenantAdminsDoNotCountAsAReplacement() {
        user(tenant, "DISABLED", "TENANT_ADMIN");
        user(tenant, "INVITED", "TENANT_ADMIN");
        user(tenant(), "ACTIVE", "TENANT_ADMIN");
        assertThatThrownBy(() -> transaction.execute(tx -> users.update(tenant, admin, admin, update(admin, "FINANCE"))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one active Tenant Admin");
    }

    @Test
    void administratorCanKeepAdminAndAddOperations() {
        var result = transaction.execute(tx -> users.update(tenant, admin, admin, update(admin, "TENANT_ADMIN", "OPERATIONS")));
        assertThat(result.roles()).containsExactlyInAnyOrder("TENANT_ADMIN", "OPERATIONS");
        assertThat(activeAdmins(tenant)).isEqualTo(1);
    }

    @Test
    void createNewAdministratorBeforeDemotingCurrentAdministrator() {
        var replacement = transaction.execute(tx -> users.create(tenant, admin,
                new CreateTenantUserRequest("Replacement Admin", null, "replacement@example.com", null,
                        "Password123!", List.of("TENANT_ADMIN"), null)));
        transaction.execute(tx -> users.update(tenant, admin, admin, update(admin, "OPERATIONS")));
        assertThat(activeAdmins(tenant)).isEqualTo(1);
        assertThat(users.list(tenant)).filteredOn(user -> user.id().equals(replacement.id()))
                .allSatisfy(user -> assertThat(user.roles()).contains("TENANT_ADMIN"));
    }

    @Test
    void globalDisableWithReplacementsRevokesRefreshSessionsInAllTenants() {
        var shared = user(tenant, "ACTIVE", "OPERATIONS");
        var otherTenant = tenant();
        role(otherTenant, shared, "TENANT_ADMIN");
        user(otherTenant, "ACTIVE", "TENANT_ADMIN");
        for (var tenantId : List.of(tenant, otherTenant)) {
            jdbc.update("INSERT INTO auth_refresh_sessions(user_id,tenant_id,token_hash,client_type,expires_at) VALUES (?, ?, ?, 'TENANT', now() + interval '1 day')", shared, tenantId, UUID.randomUUID().toString());
        }
        transaction.execute(tx -> users.updateStatus(tenant, admin, shared, "DISABLED"));
        assertThat(activeAdmins(otherTenant)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_refresh_sessions WHERE user_id = ? AND revoked_at IS NULL", Integer.class, shared)).isZero();
    }

    @Test
    void promoteReplacementThenDemoteCurrentAdminAndDenyFurtherAdministration() {
        var replacement = user(tenant, "ACTIVE", "OPERATIONS");
        transaction.execute(tx -> users.update(tenant, admin, replacement, update(replacement, "TENANT_ADMIN")));
        transaction.execute(tx -> users.update(tenant, admin, admin, update(admin, "OPERATIONS")));
        assertThat(activeAdmins(tenant)).isEqualTo(1);
        assertThatThrownBy(() -> transaction.execute(tx -> users.update(tenant, admin, replacement, update(replacement, "OPERATIONS"))))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void globalDisableCannotOrphanAnotherTenant() {
        var otherTenant = tenant();
        var sharedUser = user(tenant, "ACTIVE", "OPERATIONS");
        role(otherTenant, sharedUser, "TENANT_ADMIN");
        assertThatThrownBy(() -> transaction.execute(tx -> users.updateStatus(tenant, admin, sharedUser, "DISABLED")))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one active Tenant Admin");
        assertThat(activeAdmins(otherTenant)).isEqualTo(1);
    }

    @Test
    void canDeactivateOrRemoveExtraAdminWithoutRemovingTheLast() {
        var extra = user(tenant, "ACTIVE", "TENANT_ADMIN");
        transaction.execute(tx -> users.updateStatus(tenant, admin, extra, "DISABLED"));
        assertThat(activeAdmins(tenant)).isEqualTo(1);
        transaction.executeWithoutResult(tx -> users.delete(tenant, admin, extra));
        assertThat(activeAdmins(tenant)).isEqualTo(1);
    }

    @Test
    void selfDeactivationAndRemovalRemainBlocked() {
        assertThatThrownBy(() -> transaction.execute(tx -> users.updateStatus(tenant, admin, admin, "DISABLED")))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("own login");
        assertThatThrownBy(() -> transaction.executeWithoutResult(tx -> users.delete(tenant, admin, admin)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("own login");
    }

    @Test
    void concurrentSelfDemotionsLeaveExactlyOneActiveAdmin() throws Exception {
        var second = user(tenant, "ACTIVE", "TENANT_ADMIN");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var attempts = List.of(admin, second).stream().map(id -> executor.submit(() -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out");
                try {
                    transaction.execute(tx -> users.update(tenant, id, id, update(id, "OPERATIONS")));
                    return true;
                } catch (BadRequestException blocked) { return false; }
            })).toList();
            start.countDown();
            var successes = 0;
            for (var attempt : attempts) if (attempt.get(20, TimeUnit.SECONDS)) successes++;
            assertThat(successes).isEqualTo(1);
        }
        assertThat(activeAdmins(tenant)).isEqualTo(1);
    }

    @Test
    void recipientsContainOnlyActiveUsersInCurrentTenant() {
        var worker = user(tenant, "ACTIVE", "FIELD_WORKER");
        user(tenant, "DISABLED", "FIELD_WORKER");
        user(tenant(), "ACTIVE", "FIELD_WORKER");
        assertThat(users.recipients(tenant)).extracting(recipient -> recipient.id()).containsExactlyInAnyOrder(admin, worker);
    }

    private UUID tenant() {
        return jdbc.queryForObject("INSERT INTO tenants(legal_name,display_name) VALUES ('Services','Services') RETURNING id", UUID.class);
    }

    @Test
    void platformAdminCanRecoverAnOrphanedTenantWithoutChangingPasswords() {
        var operator = user(tenant, "ACTIVE", "OPERATIONS");
        jdbc.update("UPDATE app_users SET password_hash = 'keep-this-hash' WHERE id = ?", operator);
        jdbc.update("DELETE FROM user_tenant_roles WHERE tenant_id = ? AND user_id = ?", tenant, admin);
        var result = transaction.execute(tx -> users.updatePortalAccess(tenant, platformAdmin(), operator,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN", "OPERATIONS"), false, "Verified tenant owner requested recovery")));
        assertThat(result.roles()).containsExactlyInAnyOrder("TENANT_ADMIN", "OPERATIONS");
        assertThat(activeAdmins(tenant)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM app_users WHERE id = ?", String.class, operator)).isEqualTo("keep-this-hash");
        assertThat(jdbc.queryForObject("SELECT resource_type FROM audit_logs WHERE action = 'SUPERADMIN_USER_ACCESS_UPDATED'", String.class)).isEqualTo("PLATFORM_ACCESS");
        assertThat(jdbc.queryForObject("SELECT metadata::text FROM audit_logs WHERE action = 'TENANT_USER_ACCESS_UPDATED'", String.class))
                .contains("TENANT_ADMIN").doesNotContain("reason", "Verified tenant owner");
    }

    @Test
    void platformRecoveryRequiresExplicitConfirmationToReactivateAccount() {
        var disabled = user(tenant, "DISABLED", "OPERATIONS");
        var platform = platformAdmin();
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, disabled,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), false, "Owner requested administrator recovery"))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("reactivation");
        var result = transaction.execute(tx -> users.updatePortalAccess(tenant, platform, disabled,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), true, "Owner confirmed account reactivation")));
        assertThat(result.status()).isEqualTo("ACTIVE");
    }

    @Test
    void platformAdminCannotRemoveLastAdministratorOrAllTenantRoles() {
        var platform = platformAdmin();
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, admin,
                new UpdateTenantPortalAccessRequest(List.of("OPERATIONS"), false, "Requested role change during support"))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one active");
        var operator = user(tenant, "ACTIVE", "OPERATIONS");
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, operator,
                new UpdateTenantPortalAccessRequest(List.of(), false, "Requested removal of portal access"))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("At least one tenant role");
    }

    @Test
    void platformSupportCannotChangeOtherTenantUsersOrAssignPlatformAndWorkerRoles() {
        var platform = platformAdmin();
        var outsider = user(tenant(), "ACTIVE", "OPERATIONS");
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, outsider,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), false, "A support recovery operation"))))
                .isInstanceOf(com.lorne.platform.shared.exception.ResourceNotFoundException.class);
        for (var role : List.of("SUPER_ADMIN", "FIELD_WORKER", "CUSTOMER")) {
            assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, admin,
                    new UpdateTenantPortalAccessRequest(List.of(role), false, "A support recovery operation"))))
                    .isInstanceOf(BadRequestException.class).hasMessageContaining("Only Tenant Admin");
        }
    }

    @Test
    void tenantAdminAndDisabledPlatformAdminCannotUseRecovery() {
        var request = new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), false, "A support recovery operation");
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, admin, admin, request)))
                .isInstanceOf(AccessDeniedException.class);
        var platform = platformAdmin();
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", platform);
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, admin, request)))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void supportPreservesWorkerRoleAndRejectsBlankReasons() {
        var worker = user(tenant, "ACTIVE", "FIELD_WORKER");
        role(tenant, worker, "OPERATIONS");
        var platform = platformAdmin();
        assertThatThrownBy(() -> transaction.execute(tx -> users.updatePortalAccess(tenant, platform, worker,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), false, "          "))))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("support reason");
        var result = transaction.execute(tx -> users.updatePortalAccess(tenant, platform, worker,
                new UpdateTenantPortalAccessRequest(List.of("TENANT_ADMIN"), false, "Owner assigned backup administrator")));
        assertThat(result.roles()).containsExactlyInAnyOrder("TENANT_ADMIN", "FIELD_WORKER");
    }

    private UUID platformAdmin() {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, ?, 'Platform Admin', 'ACTIVE')", id, id + "@example.com");
        jdbc.update("INSERT INTO user_tenant_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code = 'SUPER_ADMIN'", id);
        return id;
    }

    private UUID user(UUID tenantId, String status, String role) {
        var id = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, ?, 'User', ?::user_status)", id, id + "@example.com", status);
        role(tenantId, id, role);
        return id;
    }

    private void role(UUID tenantId, UUID userId, String role) {
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = ?", tenantId, userId, role);
    }

    private int activeAdmins(UUID tenantId) {
        return jdbc.queryForObject("SELECT count(*) FROM user_tenant_roles utr JOIN roles r ON r.id = utr.role_id JOIN app_users u ON u.id = utr.user_id WHERE utr.tenant_id = ? AND r.code = 'TENANT_ADMIN' AND u.status = 'ACTIVE'", Integer.class, tenantId);
    }

    private String email(UUID userId) {
        return jdbc.queryForObject("SELECT email FROM app_users WHERE id = ?", String.class, userId);
    }

    private UpdateTenantUserRequest update(UUID userId, String... roles) {
        return new UpdateTenantUserRequest("Changed", null, email(userId), null, null, List.of(roles), null);
    }
}
