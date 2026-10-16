package com.lorne.platform.superadmin.internal.service;

import com.lorne.platform.superadmin.internal.dto.SuperAdminOverviewResponse;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SuperAdminOverviewService {
    private final JdbcTemplate jdbc;
    public SuperAdminOverviewService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional(readOnly = true)
    public SuperAdminOverviewResponse overview() {
        var statuses = jdbc.query("SELECT status::text AS status, count(*)::int AS count FROM tenants GROUP BY status ORDER BY status",
                (rs, row) -> new SuperAdminOverviewResponse.StatusCount(rs.getString("status"), rs.getInt("count")));
        var total = statuses.stream().mapToInt(SuperAdminOverviewResponse.StatusCount::count).sum();
        var enabled = statuses.stream().filter(item -> List.of("ACTIVE", "TRIAL", "PAST_DUE").contains(item.status())).mapToInt(SuperAdminOverviewResponse.StatusCount::count).sum();
        var support = jdbc.queryForObject("""
                SELECT count(*) FILTER (WHERE status = 'OPEN')::int AS open,
                       count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS progress,
                       count(*) FILTER (WHERE status = 'WAITING_ON_TENANT')::int AS waiting,
                       count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND priority = 'URGENT')::int AS urgent,
                       count(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED') AND assigned_to IS NULL)::int AS unassigned
                FROM support_tickets
                """, (rs, row) -> new SuperAdminOverviewResponse.SupportSummary(rs.getInt("open"), rs.getInt("progress"), rs.getInt("waiting"), rs.getInt("urgent"), rs.getInt("unassigned")));
        var unresolved = support.open() + support.inProgress() + support.waitingOnTenant();
        var health = jdbc.query("""
                SELECT t.id, t.display_name, t.portal_subdomain, t.status::text AS status,
                       (SELECT count(DISTINCT ur.user_id)::int FROM user_tenant_roles ur JOIN app_users u ON u.id = ur.user_id AND u.status = 'ACTIVE' WHERE ur.tenant_id = t.id) AS users,
                       (SELECT count(*)::int FROM user_tenant_roles ur JOIN app_users u ON u.id = ur.user_id AND u.status = 'ACTIVE'
                           JOIN roles r ON r.id = ur.role_id AND r.code = 'TENANT_ADMIN' WHERE ur.tenant_id = t.id) AS admins,
                       (SELECT max(u.last_login_at) FROM user_tenant_roles ur JOIN app_users u ON u.id = ur.user_id WHERE ur.tenant_id = t.id) AS last_login,
                       (SELECT count(*)::int FROM support_tickets st WHERE st.tenant_id = t.id AND st.status NOT IN ('RESOLVED','CLOSED')) AS tickets
                FROM tenants t ORDER BY admins, tickets DESC, t.display_name, t.id LIMIT 50
                """, (rs, row) -> new SuperAdminOverviewResponse.TenantHealth(rs.getObject("id", java.util.UUID.class),
                rs.getString("display_name"), rs.getString("portal_subdomain"), rs.getString("status"), rs.getInt("users"),
                rs.getInt("admins"), rs.getInt("tickets"), rs.getTimestamp("last_login") == null ? null : rs.getTimestamp("last_login").toInstant()));
        var missingAdmin = jdbc.queryForObject("""
                SELECT count(*)::int FROM tenants t WHERE NOT EXISTS (
                SELECT 1 FROM user_tenant_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'TENANT_ADMIN'
                JOIN app_users u ON u.id = ur.user_id AND u.status = 'ACTIVE' WHERE ur.tenant_id = t.id)
                """, Integer.class);
        var actions = new ArrayList<SuperAdminOverviewResponse.AdminAction>();
        if (missingAdmin != null && missingAdmin > 0) actions.add(new SuperAdminOverviewResponse.AdminAction("Administrator recovery", missingAdmin + " tenants have no active administrator.", "danger", "/tenants?adminAccess=missing"));
        if (support.urgent() > 0) actions.add(new SuperAdminOverviewResponse.AdminAction("Urgent support", support.urgent() + " urgent tickets need attention.", "danger", "/support-tickets?priority=URGENT&status=UNRESOLVED"));
        if (support.unassigned() > 0) actions.add(new SuperAdminOverviewResponse.AdminAction("Support assignment", support.unassigned() + " unresolved tickets have no owner.", "warn", "/support-tickets?status=UNRESOLVED"));
        return new SuperAdminOverviewResponse(List.of(
                new SuperAdminOverviewResponse.PlatformMetric("Total tenants", String.valueOf(total), "info", "pi pi-building"),
                new SuperAdminOverviewResponse.PlatformMetric("Access enabled", String.valueOf(enabled), "success", "pi pi-check-circle"),
                new SuperAdminOverviewResponse.PlatformMetric("Inactive tenants", String.valueOf(total - enabled), "warn", "pi pi-pause-circle"),
                new SuperAdminOverviewResponse.PlatformMetric("Unresolved tickets", String.valueOf(unresolved), "info", "pi pi-ticket")
        ), health, actions, statuses, support);
    }
}
