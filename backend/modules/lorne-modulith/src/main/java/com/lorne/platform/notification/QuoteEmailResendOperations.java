package com.lorne.platform.notification;

import java.util.UUID;

public interface QuoteEmailResendOperations {
    OutboundEmailAttachment quoteAttachment(UUID tenantId, UUID quoteId, String emailBody);
}
