package com.lorne.platform.superadmin.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.superadmin.internal.dto.PlatformAuditPage;
import com.lorne.platform.superadmin.internal.dto.TenantHealthReport;
import com.lorne.platform.superadmin.internal.dto.TenantSupportNote;
import com.lorne.platform.superadmin.internal.dto.TenantOperationsOverview;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlatformSupportService {
    private final JdbcTemplate jdbc;
    private final AuditWriter audit;

    public PlatformSupportService(JdbcTemplate jdbc, AuditWriter audit) { this.jdbc = jdbc; this.audit = audit; }

    @Transactional(readOnly = true)
    public TenantHealthReport health(UUID tenantId) {
        requireTenant(tenantId);
        var admins = count("""
                SELECT count(*) FROM user_tenant_roles utr JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE' WHERE utr.tenant_id = ?
                """, tenantId);
        var users = count("SELECT count(DISTINCT utr.user_id) FROM user_tenant_roles utr JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE' WHERE utr.tenant_id = ?", tenantId);
        var workers = count("SELECT count(*) FROM workers WHERE tenant_id = ? AND status = 'ACTIVE'", tenantId);
        var unlinked = count("""
                SELECT count(*) FROM workers w WHERE w.tenant_id = ? AND w.status = 'ACTIVE'
                AND NOT EXISTS (SELECT 1 FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id AND r.code = 'FIELD_WORKER'
                    JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                    WHERE utr.user_id = w.user_id AND utr.tenant_id = w.tenant_id)
                """, tenantId);
        var settings = jdbc.queryForMap("""
                SELECT t.status::text AS status, t.portal_subdomain, s.logo_url, s.billing_email, s.phone,
                       s.address_line1, s.city, s.country_code
                FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id = t.id WHERE t.id = ?
                """, tenantId);
        var checks = new ArrayList<TenantHealthReport.Check>();
        checks.add(new TenantHealthReport.Check("ADMIN_ACCESS", "Administrator access", admins == 0 ? "CRITICAL" : admins == 1 ? "WARNING" : "PASS",
                admins == 0 ? "No active Tenant Admin. Restore access from Users & access." : admins == 1 ? "Only one active Tenant Admin. Assign a backup administrator." : admins + " active tenant administrators."));
        var accessible = List.of("ACTIVE", "TRIAL", "PAST_DUE").contains(settings.get("status"));
        checks.add(new TenantHealthReport.Check("TENANT_STATUS", "Tenant access", accessible ? "PASS" : "WARNING", "Current status: " + settings.get("status") + "."));
        checks.add(new TenantHealthReport.Check("PORTAL_IDENTITY", "Portal identity", present(settings, "portal_subdomain") ? "PASS" : "CRITICAL",
                present(settings, "portal_subdomain") ? "Subdomain configured: " + settings.get("portal_subdomain") + ". DNS and TLS require separate verification." : "No portal subdomain is configured."));
        checks.add(new TenantHealthReport.Check("COMPANY_LOGO", "Company logo", present(settings, "logo_url") ? "PASS" : "WARNING",
                present(settings, "logo_url") ? "A company logo is configured." : "No company logo is configured for login and documents."));
        var contact = present(settings, "billing_email") && present(settings, "phone");
        checks.add(new TenantHealthReport.Check("COMPANY_CONTACT", "Company contact", contact ? "PASS" : "WARNING", contact ? "Billing email and phone are configured." : "Billing email or company phone is missing."));
        var address = present(settings, "address_line1") && present(settings, "city") && present(settings, "country_code");
        checks.add(new TenantHealthReport.Check("COMPANY_ADDRESS", "Company address", address ? "PASS" : "WARNING", address ? "Street, city and country are configured." : "Complete the street, city and country; country alone is not a full address."));
        checks.add(new TenantHealthReport.Check("WORKER_LOGINS", "Worker app access", unlinked > 0 ? "WARNING" : workers == 0 ? "INFO" : "PASS",
                unlinked > 0 ? unlinked + " active workers have no linked active Field Worker login." : workers == 0 ? "No active workers have been added." : "All active workers have linked active app logins."));
        return new TenantHealthReport(tenantId, Instant.now(), admins, users, workers, unlinked, checks);
    }

    @Transactional(readOnly = true)
    public List<TenantSupportNote> notes(UUID tenantId) {
        requireTenant(tenantId);
        return jdbc.query("""
                SELECT a.id, a.metadata->>'note' AS note, u.display_name AS actor_name, a.created_at
                FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_user_id
                WHERE a.tenant_id = ? AND a.action = 'SUPERADMIN_SUPPORT_NOTE_ADDED'
                ORDER BY a.created_at DESC, a.id DESC LIMIT 100
                """, (rs, row) -> new TenantSupportNote(rs.getObject("id", UUID.class), rs.getString("note"),
                rs.getString("actor_name"), rs.getTimestamp("created_at").toInstant()), tenantId);
    }

    @Transactional
    public List<TenantSupportNote> addNote(UUID tenantId, UUID actorId, String value) {
        requireTenant(tenantId);
        var note = value == null ? "" : value.trim();
        if (note.isEmpty() || note.length() > 4000) throw new BadRequestException("Enter a support note between 1 and 4000 characters.");
        audit.record(tenantId, actorId, "SUPERADMIN_SUPPORT_NOTE_ADDED", "PLATFORM_SUPPORT", tenantId, Map.of("note", note));
        return notes(tenantId);
    }

    @Transactional(readOnly = true)
    public PlatformAuditPage audit(UUID tenantId, String query, Instant from, Instant until, int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 100) throw new BadRequestException("Invalid audit page or page size.");
        if (from != null && until != null && !from.isBefore(until)) throw new BadRequestException("The end date must be after the start date.");
        if (query != null && query.length() > 200) throw new BadRequestException("Audit search must be 200 characters or fewer.");
        var sql = new StringBuilder("""
                FROM audit_logs a LEFT JOIN app_users u ON u.id = a.actor_user_id LEFT JOIN tenants t ON t.id = a.tenant_id
                WHERE ((a.resource_type = 'TENANT' AND a.action IN ('TENANT_ONBOARDED','TENANT_UPDATED','TENANT_MODULE_ENABLED','TENANT_MODULE_DISABLED','TENANT_QUOTE_TEMPLATES_UPDATED'))
                    OR a.action IN ('SUPERADMIN_USER_ACCESS_UPDATED','SUPERADMIN_SUPPORT_NOTE_ADDED','SUPERADMIN_TENANT_ACCESS_UPDATED','QUOTE_TEMPLATE_UPDATED'))
                """);
        var args = new ArrayList<Object>();
        if (tenantId != null) { sql.append(" AND a.tenant_id = ?"); args.add(tenantId); }
        if (from != null) { sql.append(" AND a.created_at >= ?::timestamptz"); args.add(from.toString()); }
        if (until != null) { sql.append(" AND a.created_at < ?::timestamptz"); args.add(until.toString()); }
        if (query != null && !query.isBlank()) {
            sql.append(" AND concat_ws(' ', t.display_name, u.display_name, u.email, a.action, a.metadata->>'reason', a.metadata->>'userEmail', a.metadata->>'note', a.metadata->>'code', a.metadata->>'name', a.metadata->>'default') ILIKE ? ESCAPE '\\'");
            args.add("%" + query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        var total = jdbc.queryForObject("SELECT count(*) " + sql, Long.class, args.toArray());
        var selection = """
                SELECT a.id, a.tenant_id, t.display_name AS tenant_name, a.action, u.display_name AS actor_name,
                       u.email::text AS actor_email, a.resource_type, a.resource_id, a.created_at,
                       concat_ws(' / ', a.metadata->>'userEmail',
                           CASE WHEN jsonb_exists(a.metadata, 'roles') THEN 'Roles: ' || (a.metadata->'roles')::text END,
                           coalesce(a.metadata->>'reason', a.metadata->>'note', a.metadata->>'moduleCode', a.metadata->>'portalSubdomain', a.metadata->>'name', ''),
                           CASE WHEN jsonb_exists(a.metadata, 'templates') THEN 'Templates: ' || (a.metadata->'templates')::text END,
                           CASE WHEN jsonb_exists(a.metadata, 'default') THEN 'Default: ' || (a.metadata->>'default') END) AS detail
                """;
        args.add(size); args.add((long) page * size);
        var events = jdbc.query(selection + sql + " ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?",
                (rs, row) -> new PlatformAuditPage.Event(rs.getObject("id", UUID.class), rs.getObject("tenant_id", UUID.class),
                        rs.getString("tenant_name"), rs.getString("action"), rs.getString("actor_name"), rs.getString("actor_email"),
                        rs.getString("resource_type"), rs.getObject("resource_id", UUID.class), rs.getString("detail"),
                        rs.getTimestamp("created_at").toInstant()), args.toArray());
        return new PlatformAuditPage(events, total == null ? 0 : total, page, size);
    }

    private void requireTenant(UUID tenantId) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM tenants WHERE id = ?)", Boolean.class, tenantId))) {
            throw new ResourceNotFoundException("Tenant not found.");
        }
    }

    @Transactional(readOnly = true)
    public TenantOperationsOverview operations(UUID tenantId) {
        requireTenant(tenantId);
        return jdbc.queryForObject("""
                SELECT (SELECT count(*)::int FROM properties WHERE tenant_id = t.id AND active) AS properties,
                (SELECT count(*)::int FROM workers WHERE tenant_id = t.id AND status = 'ACTIVE') AS workers,
                (SELECT count(*)::int FROM work_orders WHERE tenant_id = t.id AND status NOT IN ('COMPLETED','APPROVED','CUSTOMER_NOTIFIED','INVOICED','PAID','CANCELLED')) AS open_work,
                (SELECT count(*)::int FROM work_orders WHERE tenant_id = t.id AND status IN ('COMPLETED','APPROVED','CUSTOMER_NOTIFIED','INVOICED','PAID')) AS completed_work,
                (SELECT count(*)::int FROM support_tickets WHERE tenant_id = t.id AND status NOT IN ('RESOLVED','CLOSED')) AS open_tickets,
                (SELECT count(*)::int FROM support_tickets WHERE tenant_id = t.id AND status IN ('RESOLVED','CLOSED')) AS resolved_tickets,
                (SELECT max(u.last_login_at) FROM user_tenant_roles ur JOIN app_users u ON u.id = ur.user_id WHERE ur.tenant_id = t.id) AS last_login
                FROM tenants t WHERE t.id = ?
                """, (rs, row) -> new TenantOperationsOverview(rs.getInt("properties"), rs.getInt("workers"), rs.getInt("open_work"),
                rs.getInt("completed_work"), rs.getInt("open_tickets"), rs.getInt("resolved_tickets"),
                rs.getTimestamp("last_login") == null ? null : rs.getTimestamp("last_login").toInstant()), tenantId);
    }
    private int count(String sql, UUID tenantId) { return jdbc.queryForObject(sql, Integer.class, tenantId); }
    private boolean present(Map<String, Object> values, String key) { return values.get(key) instanceof String value && !value.isBlank(); }
}
