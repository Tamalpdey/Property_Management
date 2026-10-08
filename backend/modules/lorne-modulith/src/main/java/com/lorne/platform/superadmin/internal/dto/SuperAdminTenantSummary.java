package com.lorne.platform.superadmin.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record SuperAdminTenantSummary(
        UUID id,
        String legalName,
        String displayName,
        String portalSubdomain,
        String status,
        String planCode,
        String timezone,
        String countryCode,
        String provinceCode,
        String administratorEmail,
        int activeUsers,
        int activeProperties,
        Instant createdAt
) {
}
