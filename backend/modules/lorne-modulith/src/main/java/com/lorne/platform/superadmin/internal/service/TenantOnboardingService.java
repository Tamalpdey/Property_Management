package com.lorne.platform.superadmin.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.superadmin.internal.dto.CreateTenantOnboardingRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantSummary;
import com.lorne.platform.superadmin.internal.dto.TenantOnboardingResponse;
import com.lorne.platform.superadmin.internal.dto.UpdateTenantRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantDetail;
import com.lorne.platform.superadmin.internal.dto.TenantAdministrationEvent;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.time.DateTimeException;
import java.time.ZoneId;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantOnboardingService {
    private static final Pattern PORTAL_SUBDOMAIN = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$");
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Set<String> TENANT_STATUSES = Set.of("TRIAL", "ACTIVE");
    private static final Set<String> PLAN_CODES = Set.of("starter", "professional", "enterprise");
    private static final Set<String> RESERVED_SUBDOMAINS = Set.of("admin", "api", "app", "mail", "support", "www", "worker");

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final AuditWriter auditWriter;

    public TenantOnboardingService(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<SuperAdminTenantSummary> list() {
        return queryTenants(null);
    }

    private List<SuperAdminTenantSummary> queryTenants(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT t.id, t.legal_name, t.display_name, t.portal_subdomain, t.status::text AS status,
                       t.plan_code, t.timezone, t.country_code, t.province_code, t.created_at,
                       (SELECT u.email::text
                        FROM user_tenant_roles utr
                        JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                        JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                        WHERE utr.tenant_id = t.id
                        ORDER BY utr.created_at
                        LIMIT 1) AS administrator_email,
                       (SELECT count(DISTINCT utr.user_id)::int
                        FROM user_tenant_roles utr
                        JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                        WHERE utr.tenant_id = t.id) AS active_users,
                       (SELECT count(*)::int FROM user_tenant_roles utr
                        JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                        JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                        WHERE utr.tenant_id = t.id) AS active_administrators,
                       (SELECT count(*)::int FROM properties p WHERE p.tenant_id = t.id AND p.active = true) AS active_properties,
                       EXISTS (
                           SELECT 1 FROM tenant_modules tm
                           WHERE tm.tenant_id = t.id AND tm.module_code = 'QUOTES' AND tm.enabled = true
                       ) AS quote_management_enabled
                FROM tenants t
                WHERE (?::uuid IS NULL OR t.id = ?)
                ORDER BY t.created_at DESC, t.display_name
                """, (rs, rowNum) -> new SuperAdminTenantSummary(
                rs.getObject("id", UUID.class),
                rs.getString("legal_name"),
                rs.getString("display_name"),
                rs.getString("portal_subdomain"),
                rs.getString("status"),
                rs.getString("plan_code"),
                rs.getString("timezone"),
                rs.getString("country_code"),
                rs.getString("province_code"),
                rs.getString("administrator_email"),
                rs.getInt("active_users"),
                rs.getInt("active_administrators"),
                rs.getInt("active_properties"),
                rs.getBoolean("quote_management_enabled"),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId, tenantId);
    }

    @Transactional
    public TenantOnboardingResponse create(UUID actorUserId, CreateTenantOnboardingRequest request) {
        var portalSubdomain = normalizeSubdomain(request.portalSubdomain());
        var status = request.status().trim().toUpperCase(Locale.ROOT);
        if (!TENANT_STATUSES.contains(status)) {
            throw new BadRequestException("A new tenant must start in trial or active status.");
        }
        var planCode = request.planCode().trim().toLowerCase(Locale.ROOT);
        if (!PLAN_CODES.contains(planCode)) {
            throw new BadRequestException("Tenant plan must be starter, professional, or enterprise.");
        }
        validateTimezone(request.timezone());
        var email = request.adminEmail().trim().toLowerCase(Locale.ROOT);
        if (emailExists(email)) {
            throw new DuplicateResourceException("Administrator email already belongs to an existing account.");
        }

        var primary = color(request.themePrimaryColor(), "#0f766e", "Primary color");
        var accent = color(request.themeAccentColor(), "#2563eb", "Accent color");
        var navigation = color(request.themeNavigationColor(), "#0f172a", "Navigation color");

        try {
            var tenantId = jdbcTemplate.queryForObject("""
                    INSERT INTO tenants (
                        legal_name, display_name, status, plan_code, timezone, country_code, province_code,
                        portal_subdomain, created_by, updated_by
                    )
                    VALUES (?, ?, ?::tenant_status, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """, UUID.class,
                    request.legalName().trim(), request.displayName().trim(), status,
                    planCode, request.timezone().trim(),
                    request.countryCode().trim().toUpperCase(Locale.ROOT), blankToNull(request.provinceCode()),
                    portalSubdomain, actorUserId, actorUserId);

            jdbcTemplate.update("""
                    INSERT INTO tenant_settings (
                        tenant_id, organization_name, billing_email, support_email, phone, website_url,
                        address_line1, address_line2, city, province_code, postal_code, country_code,
                        theme_primary_color, theme_accent_color, theme_navigation_color,
                        login_headline, login_message, created_by, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    tenantId, request.displayName().trim(), blankToNull(request.billingEmail()),
                    blankToNull(request.supportEmail()), blankToNull(request.companyPhone()), blankToNull(request.websiteUrl()),
                    blankToNull(request.addressLine1()), blankToNull(request.addressLine2()), blankToNull(request.city()),
                    blankToNull(request.provinceCode()), blankToNull(request.postalCode()), request.countryCode().trim().toUpperCase(Locale.ROOT),
                    primary, accent, navigation, valueOrDefault(request.loginHeadline(), "Welcome back"),
                    valueOrDefault(request.loginMessage(), "Access your operations workspace."), actorUserId, actorUserId);

            var administratorUserId = jdbcTemplate.queryForObject("""
                    INSERT INTO app_users (email, display_name, phone, password_hash, status, created_by, updated_by)
                    VALUES (?, ?, ?, ?, 'ACTIVE'::user_status, ?, ?)
                    RETURNING id
                    """, UUID.class, email, request.adminDisplayName().trim(), blankToNull(request.adminPhone()),
                    passwordEncoder.encode(request.temporaryPassword()), actorUserId, actorUserId);

            var roleCount = jdbcTemplate.update("""
                    INSERT INTO user_tenant_roles (tenant_id, user_id, role_id, created_by)
                    SELECT ?, ?, id, ? FROM roles WHERE code = 'TENANT_ADMIN'
                    """, tenantId, administratorUserId, actorUserId);
            if (roleCount != 1) {
                throw new IllegalStateException("Tenant administrator role is not configured.");
            }

            if (request.quoteManagementEnabled()) {
                setModuleEnabled(tenantId, actorUserId, "QUOTES", true);
            }

            auditWriter.record(tenantId, actorUserId, "TENANT_ONBOARDED", "TENANT", tenantId, Map.of(
                    "displayName", request.displayName().trim(),
                    "portalSubdomain", portalSubdomain,
                    "planCode", planCode,
                    "administratorEmail", email
            ));
            return new TenantOnboardingResponse(
                    tenantId, request.displayName().trim(), portalSubdomain, status,
                    planCode, administratorUserId, email);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("The portal subdomain or administrator email is already in use.");
        }
    }

    private boolean emailExists(String email) {
        var count = jdbcTemplate.queryForObject("SELECT count(*)::int FROM app_users WHERE lower(email) = lower(?)", Integer.class, email);
        return count != null && count > 0;
    }

    @Transactional(readOnly = true)
    public SuperAdminTenantDetail detail(UUID tenantId) {
        var tenant = summary(tenantId);
        var profiles = jdbcTemplate.query("""
                SELECT t.*, coalesce(s.organization_name, t.display_name) AS organization_name,
                       s.billing_email, s.support_email, s.phone, s.website_url,
                       s.address_line1, s.address_line2, s.city, s.postal_code
                FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id = t.id WHERE t.id = ?
                """, (rs, row) -> new UpdateTenantRequest(rs.getString("legal_name"), rs.getString("display_name"),
                rs.getString("portal_subdomain"), rs.getString("plan_code"), rs.getString("status"),
                rs.getString("timezone"), rs.getString("country_code"), rs.getString("province_code"),
                rs.getString("organization_name"), rs.getString("billing_email"), rs.getString("support_email"),
                rs.getString("phone"), rs.getString("website_url"), rs.getString("address_line1"),
                rs.getString("address_line2"), rs.getString("city"), rs.getString("postal_code")), tenantId);
        if (profiles.isEmpty()) throw new ResourceNotFoundException("Tenant not found.");
        return new SuperAdminTenantDetail(tenant, profiles.getFirst());
    }

    @Transactional
    public SuperAdminTenantDetail update(UUID actorUserId, UUID tenantId, UpdateTenantRequest request) {
        var subdomain = normalizeSubdomain(request.portalSubdomain());
        var status = request.status().trim().toUpperCase(Locale.ROOT);
        if (!Set.of("TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED").contains(status)) {
            throw new BadRequestException("Invalid tenant status.");
        }
        var plan = request.planCode().trim().toLowerCase(Locale.ROOT);
        if (!PLAN_CODES.contains(plan)) throw new BadRequestException("Invalid tenant plan.");
        validateTimezone(request.timezone());
        var locked = jdbcTemplate.queryForList("SELECT id FROM tenants WHERE id = ? FOR UPDATE", UUID.class, tenantId);
        if (locked.isEmpty()) throw new ResourceNotFoundException("Tenant not found.");
        var previous = summary(tenantId);
        try {
            jdbcTemplate.update("""
                    UPDATE tenants SET legal_name = ?, display_name = ?, portal_subdomain = ?,
                        plan_code = ?, status = ?::tenant_status, timezone = ?, country_code = ?, province_code = ?,
                        updated_by = ?, updated_at = now() WHERE id = ?
                    """, request.legalName().trim(), request.displayName().trim(), subdomain, plan, status,
                    request.timezone().trim(), request.countryCode().trim().toUpperCase(Locale.ROOT),
                    blankToNull(request.provinceCode()), actorUserId, tenantId);
            jdbcTemplate.update("""
                    INSERT INTO tenant_settings (tenant_id, organization_name, billing_email, support_email, phone,
                        website_url, address_line1, address_line2, city, province_code, postal_code, country_code, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (tenant_id) DO UPDATE SET organization_name = excluded.organization_name,
                        billing_email = excluded.billing_email, support_email = excluded.support_email, phone = excluded.phone,
                        website_url = excluded.website_url, address_line1 = excluded.address_line1, address_line2 = excluded.address_line2,
                        city = excluded.city, province_code = excluded.province_code, postal_code = excluded.postal_code,
                        country_code = excluded.country_code, updated_by = excluded.updated_by, updated_at = now()
                    """, tenantId, request.organizationName().trim(), blankToNull(request.billingEmail()),
                    blankToNull(request.supportEmail()), blankToNull(request.companyPhone()), blankToNull(request.websiteUrl()),
                    blankToNull(request.addressLine1()), blankToNull(request.addressLine2()), blankToNull(request.city()),
                    blankToNull(request.provinceCode()), blankToNull(request.postalCode()), request.countryCode().trim().toUpperCase(Locale.ROOT),
                    actorUserId, actorUserId);
            if (Set.of("SUSPENDED", "CANCELLED").contains(status)) {
                jdbcTemplate.update("UPDATE auth_refresh_sessions SET revoked_at = now() WHERE tenant_id = ? AND revoked_at IS NULL", tenantId);
            }
            auditWriter.record(tenantId, actorUserId, "TENANT_UPDATED", "TENANT", tenantId, Map.of(
                    "previousDisplayName", previous.displayName(), "displayName", request.displayName().trim(),
                    "previousStatus", previous.status(), "status", status,
                    "previousPlan", previous.planCode(), "planCode", plan,
                    "previousSubdomain", previous.portalSubdomain() == null ? "" : previous.portalSubdomain(), "portalSubdomain", subdomain));
            return detail(tenantId);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("The portal subdomain is already in use.");
        }
    }

    @Transactional(readOnly = true)
    public List<TenantAdministrationEvent> history(UUID tenantId) {
        summary(tenantId);
        return jdbcTemplate.query("""
                SELECT a.id, a.action, u.display_name AS actor_name, a.metadata->>'moduleCode' AS module_code, a.created_at
                FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_user_id
                WHERE a.tenant_id = ? AND a.resource_type = 'TENANT' AND a.resource_id = ?
                ORDER BY a.created_at DESC LIMIT 100
                """, (rs, row) -> new TenantAdministrationEvent(rs.getObject("id", UUID.class), rs.getString("action"),
                rs.getString("actor_name"), rs.getString("module_code"), rs.getTimestamp("created_at").toInstant()), tenantId, tenantId);
    }

    private SuperAdminTenantSummary summary(UUID tenantId) {
        return queryTenants(tenantId).stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Tenant not found."));
    }

    @Transactional
    public SuperAdminTenantSummary setAccess(UUID actorUserId, UUID tenantId, boolean active, String value) {
        var reason = value == null ? "" : value.trim();
        if (reason.length() < 10 || reason.length() > 1000) throw new BadRequestException("Enter an access-change reason between 10 and 1000 characters.");
        if (jdbcTemplate.queryForList("SELECT id FROM tenants WHERE id = ? FOR UPDATE", UUID.class, tenantId).isEmpty()) throw new ResourceNotFoundException("Tenant not found.");
        var previous = summary(tenantId);
        var status = active ? "ACTIVE" : "SUSPENDED";
        jdbcTemplate.update("UPDATE tenants SET status = ?::tenant_status, updated_at = now(), updated_by = ? WHERE id = ?", status, actorUserId, tenantId);
        if (!active) jdbcTemplate.update("UPDATE auth_refresh_sessions SET revoked_at = now() WHERE tenant_id = ? AND revoked_at IS NULL", tenantId);
        auditWriter.record(tenantId, actorUserId, "SUPERADMIN_TENANT_ACCESS_UPDATED", "PLATFORM_ACCESS", tenantId,
                Map.of("previousStatus", previous.status(), "status", status, "reason", reason));
        auditWriter.record(tenantId, actorUserId, "TENANT_UPDATED", "TENANT", tenantId, Map.of("previousStatus", previous.status(), "status", status));
        return summary(tenantId);
    }

    @Transactional
    public SuperAdminTenantSummary updateModule(UUID actorUserId, UUID tenantId, String moduleCode, boolean enabled) {
        var normalizedCode = moduleCode == null ? "" : moduleCode.trim().toUpperCase(Locale.ROOT);
        if (!"QUOTES".equals(normalizedCode)) {
            throw new BadRequestException("Unknown tenant module.");
        }
        var tenantCount = jdbcTemplate.queryForObject("SELECT count(*)::int FROM tenants WHERE id = ?", Integer.class, tenantId);
        if (tenantCount == null || tenantCount == 0) {
            throw new BadRequestException("Tenant not found.");
        }
        setModuleEnabled(tenantId, actorUserId, normalizedCode, enabled);
        auditWriter.record(tenantId, actorUserId, enabled ? "TENANT_MODULE_ENABLED" : "TENANT_MODULE_DISABLED", "TENANT", tenantId,
                Map.of("moduleCode", normalizedCode));
        return summary(tenantId);
    }

    private void setModuleEnabled(UUID tenantId, UUID actorUserId, String moduleCode, boolean enabled) {
        jdbcTemplate.update("""
                INSERT INTO tenant_modules (tenant_id, module_code, enabled, enabled_at, enabled_by, updated_at)
                VALUES (?, ?, ?, CASE WHEN ? THEN now() ELSE NULL END, CASE WHEN ? THEN ? ELSE NULL END, now())
                ON CONFLICT (tenant_id, module_code)
                DO UPDATE SET enabled = excluded.enabled,
                              enabled_at = CASE WHEN excluded.enabled THEN now() ELSE tenant_modules.enabled_at END,
                              enabled_by = CASE WHEN excluded.enabled THEN excluded.enabled_by ELSE tenant_modules.enabled_by END,
                              updated_at = now()
                """, tenantId, moduleCode, enabled, enabled, enabled, actorUserId);
    }

    private String normalizeSubdomain(String value) {
        var normalized = value.trim().toLowerCase(Locale.ROOT);
        if (!PORTAL_SUBDOMAIN.matcher(normalized).matches()) {
            throw new BadRequestException("Portal subdomain must contain lowercase letters, numbers, and single hyphens only.");
        }
        if (RESERVED_SUBDOMAINS.contains(normalized)) {
            throw new BadRequestException("Portal subdomain is reserved for platform use.");
        }
        return normalized;
    }

    private void validateTimezone(String value) {
        try {
            ZoneId.of(value.trim());
        } catch (DateTimeException exception) {
            throw new BadRequestException("Tenant timezone is not valid.");
        }
    }

    private String color(String value, String fallback, String label) {
        var normalized = valueOrDefault(value, fallback);
        if (!HEX_COLOR.matcher(normalized).matches()) {
            throw new BadRequestException(label + " must be a six-digit hex color.");
        }
        return normalized.toLowerCase(Locale.ROOT);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String valueOrDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
