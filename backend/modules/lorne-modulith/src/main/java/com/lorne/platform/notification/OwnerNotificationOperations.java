package com.lorne.platform.notification;

import java.util.UUID;

public interface OwnerNotificationOperations {
    NotificationDeliveryResult sendWorkOrderCompleted(
            UUID tenantId,
            UUID actorUserId,
            WorkOrderCompletionEmail email
    );
}
