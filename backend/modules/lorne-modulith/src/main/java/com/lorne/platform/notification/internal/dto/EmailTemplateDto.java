package com.lorne.platform.notification.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record EmailTemplateDto(
        UUID id,
        String templateKey,
        String name,
        String subject,
        String body,
        boolean active,
        Instant updatedAt
) {
}
