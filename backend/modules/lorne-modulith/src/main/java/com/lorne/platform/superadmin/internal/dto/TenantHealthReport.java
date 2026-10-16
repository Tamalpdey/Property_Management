package com.lorne.platform.superadmin.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record TenantHealthReport(UUID tenantId, Instant checkedAt, int activeAdministrators, int activeUsers,
                                 int activeWorkers, int workersWithoutLogin, List<Check> checks) {
    public record Check(String code, String label, String severity, String detail) { }
}
