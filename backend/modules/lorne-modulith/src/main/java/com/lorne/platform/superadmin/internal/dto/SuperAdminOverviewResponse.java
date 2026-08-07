package com.lorne.platform.superadmin.internal.dto;

import java.util.List;

public record SuperAdminOverviewResponse(
        List<PlatformMetric> metrics,
        List<TenantHealth> tenantHealth,
        List<AdminAction> priorityActions
) {
    public record PlatformMetric(String label, String value, String severity, String icon) {
    }

    public record TenantHealth(String tenantName, String status, String plan, int openWorkOrders, int activeWorkers) {
    }

    public record AdminAction(String label, String description, String severity) {
    }
}
