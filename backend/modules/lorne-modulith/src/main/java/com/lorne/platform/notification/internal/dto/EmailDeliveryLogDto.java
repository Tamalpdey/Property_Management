package com.lorne.platform.notification.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record EmailDeliveryLogDto(
        UUID id,
        String communicationType,
        String deliveryMode,
        UUID invoiceId,
        String invoiceNumber,
        UUID workOrderId,
        String workOrderNumber,
        String serviceName,
        String ownerName,
        String recipientEmail,
        String ccEmails,
        String bccEmails,
        String subject,
        String body,
        String status,
        String providerMessage,
        Instant sentAt,
        Instant createdAt
) {
}
