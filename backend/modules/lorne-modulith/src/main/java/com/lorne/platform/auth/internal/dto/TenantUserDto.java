package com.lorne.platform.auth.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record TenantUserDto(
        UUID id,
        String displayName,
        String profilePhotoUrl,
        String email,
        String phone,
        String status,
        List<String> roles,
        UUID workerId,
        String workerName,
        Instant lastLoginAt,
        Instant createdAt
) {
}
