package com.lorne.platform.superadmin.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PlatformAuditPage(List<Event> items, long total, int page, int size) {
    public record Event(UUID id, UUID tenantId, String tenantName, String action, String actorName,
                        String actorEmail, String resourceType, UUID resourceId, String detail, Instant createdAt) { }
}
