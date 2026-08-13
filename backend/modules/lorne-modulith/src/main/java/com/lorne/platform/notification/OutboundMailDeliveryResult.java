package com.lorne.platform.notification;

import java.time.Instant;

public record OutboundMailDeliveryResult(
        String status,
        String providerMessage,
        Instant sentAt,
        String provider,
        String fromAddress,
        String replyToAddress
) {
}
