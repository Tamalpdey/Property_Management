package com.lorne.platform.superadmin.internal.dto;

import java.util.List;
import java.time.Instant;
import java.util.UUID;

public record SuperAdminOverviewResponse(
        List<PlatformMetric> metrics,
        List<TenantHealth> tenantHealth,
        List<AdminAction> priorityActions,
        List<StatusCount> tenantStatuses,
        SupportSummary support
) {
    public record PlatformMetric(String label, String value, String severity, String icon) {
    }

    public record TenantHealth(UUID id, String tenantName, String subdomain, String status, int activeUsers,
                               int activeAdministrators, int openTickets, Instant lastLoginAt) {
    }

    public record AdminAction(String label, String description, String severity, String path) {
    }
    public record StatusCount(String status, int count) { }
    public record SupportSummary(int open, int inProgress, int waitingOnTenant, int urgent, int unassigned) { }
}
