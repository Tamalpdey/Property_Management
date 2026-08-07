package com.lorne.platform.audit.internal.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record AuditLogDto(
        UUID id,
        UUID tenantId,
        UUID actorUserId,
        String actorName,
        String actorEmail,
        String action,
        String resourceType,
        UUID resourceId,
        Map<String, Object> metadata,
        Instant createdAt
) {
}
