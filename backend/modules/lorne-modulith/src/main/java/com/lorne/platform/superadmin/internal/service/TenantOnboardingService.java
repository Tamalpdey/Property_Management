package com.lorne.platform.superadmin.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.superadmin.internal.dto.CreateTenantOnboardingRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantSummary;
import com.lorne.platform.superadmin.internal.dto.TenantOnboardingResponse;
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
        return jdbcTemplate.query("""
                SELECT t.id, t.legal_name, t.display_name, t.portal_subdomain, t.status::text AS status,
                       t.plan_code, t.timezone, t.country_code, t.province_code, t.created_at,
                       (SELECT u.email::text
                        FROM user_tenant_roles utr
                        JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                        JOIN app_users u ON u.id = utr.user_id
                        WHERE utr.tenant_id = t.id
                        ORDER BY utr.created_at
                        LIMIT 1) AS administrator_email,
                       (SELECT count(DISTINCT utr.user_id)::int
                        FROM user_tenant_roles utr
                        JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                        WHERE utr.tenant_id = t.id) AS active_users,
                       (SELECT count(*)::int FROM properties p WHERE p.tenant_id = t.id AND p.active = true) AS active_properties
                FROM tenants t
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
                rs.getInt("active_properties"),
                rs.getTimestamp("created_at").toInstant()
        ));
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
