package com.lorne.platform.notification;

import java.time.Instant;
import java.util.UUID;

public record WorkOrderCompletionEmail(
        UUID workOrderId,
        String workOrderNumber,
        String title,
        UUID customerId,
        String ownerCode,
        String ownerName,
        String ownerEmail,
        String ownerBillingEmail,
        String propertyCode,
        String propertyName,
        String propertyAddress,
        String serviceName,
        Instant completedAt,
        String onSiteWorkers,
        Instant arrivedOnSiteAt,
        Instant workCompletedAt,
        String serviceDetails,
        String deliveriesSummary,
        String reviewNote,
        String maintenanceRecordSummary,
        String maintenanceClientNote,
        String recipientEmailOverride,
        String ccEmails,
        String bccEmails,
        String deliveryMode
) {
}
