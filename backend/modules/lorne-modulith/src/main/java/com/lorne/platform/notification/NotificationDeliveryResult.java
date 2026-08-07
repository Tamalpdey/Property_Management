package com.lorne.platform.notification;

import java.time.Instant;
import java.util.UUID;

public record NotificationDeliveryResult(
        UUID deliveryLogId,
        String status,
        String recipientEmail,
        Instant sentAt
) {
}
