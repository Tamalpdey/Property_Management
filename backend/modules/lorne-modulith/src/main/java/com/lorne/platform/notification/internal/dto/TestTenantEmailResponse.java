package com.lorne.platform.notification.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record TestTenantEmailResponse(
        UUID deliveryLogId,
        String status,
        String recipientEmail,
        Instant sentAt,
        String providerMessage
) {
}
