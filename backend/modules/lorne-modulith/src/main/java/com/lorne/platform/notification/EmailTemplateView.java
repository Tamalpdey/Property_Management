package com.lorne.platform.notification;

import java.time.Instant;
import java.util.UUID;

public record EmailTemplateView(
        UUID id,
        String templateKey,
        String name,
        String subject,
        String body,
        boolean active,
        Instant updatedAt
) {
}
