package com.lorne.platform.workorder;

import java.util.UUID;

public interface QuoteWorkOrderOperations {
    QuoteWorkOrderResult createFromQuote(UUID tenantId, UUID actorUserId, QuoteWorkOrderRequest request);
}
