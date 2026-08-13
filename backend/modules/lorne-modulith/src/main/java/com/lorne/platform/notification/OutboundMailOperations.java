package com.lorne.platform.notification;

import java.util.UUID;

public interface OutboundMailOperations {
    OutboundMailDeliveryResult send(UUID tenantId, OutboundEmailMessage message);
}
