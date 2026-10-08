package com.lorne.platform.superadmin.internal.dto;

import java.util.UUID;

public record TenantOnboardingResponse(
        UUID tenantId,
        String displayName,
        String portalSubdomain,
        String status,
        String planCode,
        UUID administratorUserId,
        String administratorEmail
) {
}
