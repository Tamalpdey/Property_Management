package com.lorne.platform.notification;

import java.time.Instant;
import java.util.UUID;

public record WorkOrderCompletionEmail(
        UUID workOrderId,
        String workOrderNumber,
        String title,
        UUID customerId,
        String ownerName,
        String ownerEmail,
        String ownerBillingEmail,
        String propertyName,
        String propertyAddress,
        String serviceName,
        Instant completedAt,
        String reviewNote,
        String recipientEmailOverride,
        String ccEmails,
        String bccEmails,
        String deliveryMode
) {
}
