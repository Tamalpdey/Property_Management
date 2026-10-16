package com.lorne.platform.superadmin.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.superadmin.internal.dto.UpdateTenantRequest;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class TenantAdministrationIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private TenantOnboardingService service;
    private PasswordEncoder encoder;
    private final UUID tenant = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();

    @BeforeEach
    void setup() throws Exception {
        var ds = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(ds);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
        try (var connection = ds.getConnection()) {
            for (var file : new String[]{"V1__extensions_and_schemas.sql", "V2__tenants_users_roles.sql", "V3__audit_outbox_and_security.sql", "V37__tenant_settings_branding_and_email.sql", "V29__auth_refresh_sessions.sql"}) {
                ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve(file)));
            }
        }
        jdbc.execute("ALTER TABLE tenants ADD COLUMN portal_subdomain text UNIQUE");
        jdbc.execute("ALTER TABLE tenant_settings ADD COLUMN address_line2 text");
        jdbc.execute("CREATE TABLE properties(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), active boolean DEFAULT true)");
        jdbc.execute("CREATE TABLE tenant_modules(tenant_id uuid REFERENCES tenants(id), module_code text, enabled boolean DEFAULT false, enabled_at timestamptz, enabled_by uuid REFERENCES app_users(id), updated_at timestamptz, PRIMARY KEY(tenant_id,module_code))");
        jdbc.update("INSERT INTO tenants(id,legal_name,display_name,portal_subdomain,status) VALUES (?, 'North Shore Inc', 'North Shore', 'north-shore', 'ACTIVE')", tenant);
        jdbc.update("INSERT INTO tenant_settings(tenant_id,organization_name,theme_primary_color,smtp_password,logo_url) VALUES (?, 'North Shore', '#123456', 'secret-unchanged', 'logo.png')", tenant);
        jdbc.update("INSERT INTO app_users(id,email,display_name,password_hash,status) VALUES (?, 'super@example.com', 'Super Admin', 'hash-unchanged', 'ACTIVE')", actor);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'TENANT_ADMIN'", tenant, actor);
        jdbc.update("INSERT INTO properties(tenant_id) VALUES (?)", tenant);
        jdbc.update("INSERT INTO auth_refresh_sessions(user_id,tenant_id,token_hash,client_type,expires_at) VALUES (?, ?, 'token', 'TENANT', now() + interval '7 days')", actor, tenant);
        transaction = new TransactionTemplate(new DataSourceTransactionManager(ds));
        encoder = mock(PasswordEncoder.class);
        service = new TenantOnboardingService(jdbc, encoder, new AuditWriter(jdbc, new ObjectMapper()));
    }

    @Test
    void editsIdentityAndFullCompanyProfileWithoutChangingCredentialsOrBranding() {
        var detail = transaction.execute(tx -> service.update(actor, tenant, request("new-name", "ACTIVE", "enterprise")));
        assertThat(detail.tenant().portalSubdomain()).isEqualTo("new-name");
        assertThat(detail.tenant().planCode()).isEqualTo("enterprise");
        assertThat(detail.tenant().activeProperties()).isEqualTo(1);
        assertThat(detail.profile().addressLine1()).isEqualTo("130 Industry Street");
        assertThat(detail.profile().companyPhone()).isEqualTo("416-555-1234");
        assertThat(jdbc.queryForObject("SELECT smtp_password FROM tenant_settings WHERE tenant_id = ?", String.class, tenant)).isEqualTo("secret-unchanged");
        assertThat(jdbc.queryForObject("SELECT theme_primary_color FROM tenant_settings WHERE tenant_id = ?", String.class, tenant)).isEqualTo("#123456");
        assertThat(jdbc.queryForObject("SELECT password_hash FROM app_users WHERE id = ?", String.class, actor)).isEqualTo("hash-unchanged");
        assertThat(service.history(tenant)).extracting(e -> e.action()).containsExactly("TENANT_UPDATED");
        verifyNoInteractions(encoder);
    }

    @Test
    void duplicateSubdomainRollsBackProfileAndDoesNotRecordSuccess() {
        jdbc.update("INSERT INTO tenants(legal_name,display_name,portal_subdomain) VALUES ('Other','Other','taken')");
        assertThatThrownBy(() -> transaction.execute(tx -> service.update(actor, tenant, request("taken", "ACTIVE", "starter"))))
                .isInstanceOf(DuplicateResourceException.class);
        assertThat(service.detail(tenant).tenant().portalSubdomain()).isEqualTo("north-shore");
        assertThat(service.history(tenant)).isEmpty();
    }

    @Test
    void suspensionRevokesRefreshSessionsAndReactivationKeepsThemRevoked() {
        transaction.execute(tx -> service.update(actor, tenant, request("north-shore", "SUSPENDED", "starter")));
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth_refresh_sessions", Boolean.class)).isTrue();
        transaction.execute(tx -> service.update(actor, tenant, request("north-shore", "ACTIVE", "starter")));
        assertThat(service.detail(tenant).tenant().status()).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth_refresh_sessions", Boolean.class)).isTrue();
    }

    @Test
    void moduleIsOffByDefaultAndEveryToggleIsAudited() {
        assertThat(service.detail(tenant).tenant().quoteManagementEnabled()).isFalse();
        transaction.execute(tx -> service.updateModule(actor, tenant, "QUOTES", true));
        assertThat(service.detail(tenant).tenant().quoteManagementEnabled()).isTrue();
        transaction.execute(tx -> service.updateModule(actor, tenant, "QUOTES", false));
        assertThat(service.detail(tenant).tenant().quoteManagementEnabled()).isFalse();
        assertThat(service.history(tenant)).extracting(e -> e.action()).contains("TENANT_MODULE_ENABLED", "TENANT_MODULE_DISABLED");
        assertThatThrownBy(() -> transaction.execute(tx -> service.updateModule(actor, tenant, "UNKNOWN", true))).isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsInvalidStatusReservedSubdomainAndMissingTenant() {
        assertThatThrownBy(() -> transaction.execute(tx -> service.update(actor, tenant, request("admin", "ACTIVE", "starter")))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> transaction.execute(tx -> service.update(actor, tenant, request("north-shore", "UNKNOWN", "starter")))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.detail(UUID.randomUUID())).isInstanceOf(ResourceNotFoundException.class);
        assertThat(service.history(tenant)).isEmpty();
    }

    @Test
    void directoryCountsOnlyActiveAdminsAndDoesNotPresentAnInactiveAdminAsTheContact() {
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", actor);
        var backup = UUID.randomUUID();
        jdbc.update("INSERT INTO app_users(id,email,display_name,status) VALUES (?, 'backup@example.com', 'Backup', 'ACTIVE')", backup);
        jdbc.update("INSERT INTO user_tenant_roles(tenant_id,user_id,role_id) SELECT ?, ?, id FROM roles WHERE code = 'TENANT_ADMIN'", tenant, backup);
        var summary = service.detail(tenant).tenant();
        assertThat(summary.activeAdministrators()).isEqualTo(1);
        assertThat(summary.administratorEmail()).isEqualTo("backup@example.com");
        jdbc.update("UPDATE app_users SET status = 'DISABLED' WHERE id = ?", backup);
        summary = service.detail(tenant).tenant();
        assertThat(summary.activeAdministrators()).isZero();
        assertThat(summary.administratorEmail()).isNull();
    }

    @Test
    void explicitActiveInactiveControlPreservesDataAndRevokesSessions() {
        var inactive = transaction.execute(tx -> service.setAccess(actor, tenant, false, "Customer requested temporary deactivation"));
        assertThat(inactive.status()).isEqualTo("SUSPENDED");
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth_refresh_sessions", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM properties WHERE tenant_id = ?", Integer.class, tenant)).isEqualTo(1);
        assertThat(transaction.execute(tx -> service.setAccess(actor, tenant, true, "Customer approved access restoration")).status()).isEqualTo("ACTIVE");
        assertThat(jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM auth_refresh_sessions", Boolean.class)).isTrue();
        assertThatThrownBy(() -> transaction.execute(tx -> service.setAccess(actor, tenant, false, "short"))).isInstanceOf(BadRequestException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action = 'SUPERADMIN_TENANT_ACCESS_UPDATED'", Integer.class)).isEqualTo(2);
    }

    private UpdateTenantRequest request(String subdomain, String status, String plan) {
        return new UpdateTenantRequest("North Shore Limited", "North Shore", subdomain, plan, status, "America/Toronto", "CA", "ON", "North Shore Services", "billing@example.com", "help@example.com", "416-555-1234", "https://example.com", "130 Industry Street", "Unit 33", "Toronto", "M6M 5G3");
    }
}
