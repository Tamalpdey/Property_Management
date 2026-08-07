package com.lorne.platform.superadmin.internal.service;

import com.lorne.platform.superadmin.internal.dto.SuperAdminOverviewResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SuperAdminOverviewService {
    private final JdbcTemplate jdbcTemplate;

    public SuperAdminOverviewService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public SuperAdminOverviewResponse overview() {
        var tenants = jdbcTemplate.queryForObject("SELECT count(*) FROM tenants", Integer.class);
        var users = jdbcTemplate.queryForObject("SELECT count(*) FROM app_users WHERE status = 'ACTIVE'", Integer.class);
        var workers = jdbcTemplate.queryForObject("SELECT count(*) FROM workers WHERE status = 'ACTIVE'", Integer.class);

        return new SuperAdminOverviewResponse(
                List.of(
                        new SuperAdminOverviewResponse.PlatformMetric("Tenants", String.valueOf(tenants), "success", "pi pi-building"),
                        new SuperAdminOverviewResponse.PlatformMetric("Active users", String.valueOf(users), "info", "pi pi-users"),
                        new SuperAdminOverviewResponse.PlatformMetric("Active workers", String.valueOf(workers), "success", "pi pi-id-card")
                ),
                tenantHealth(),
                List.of(
                        new SuperAdminOverviewResponse.AdminAction("Review tenant readiness", "Confirm seed tenant, roles, and worker access are healthy.", "info"),
                        new SuperAdminOverviewResponse.AdminAction("Set production domains", "Replace local Caddy domains before EC2 deployment.", "warn")
                )
        );
    }

    private List<SuperAdminOverviewResponse.TenantHealth> tenantHealth() {
        return jdbcTemplate.query("""
                SELECT t.display_name, t.status::text, t.plan_code,
                       (SELECT count(*) FROM work_orders wo WHERE wo.tenant_id = t.id) AS open_work_orders,
                       (SELECT count(*) FROM workers w WHERE w.tenant_id = t.id AND w.status = 'ACTIVE') AS active_workers
                FROM tenants t
                ORDER BY t.created_at DESC
                LIMIT 10
                """, (rs, rowNum) -> new SuperAdminOverviewResponse.TenantHealth(
                rs.getString("display_name"),
                rs.getString("status"),
                rs.getString("plan_code"),
                rs.getInt("open_work_orders"),
                rs.getInt("active_workers")
        ));
    }
}
