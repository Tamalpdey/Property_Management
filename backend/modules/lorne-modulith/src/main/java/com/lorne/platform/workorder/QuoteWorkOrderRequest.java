package com.lorne.platform.workorder;

import java.util.UUID;

public record QuoteWorkOrderRequest(
        UUID propertyId,
        UUID serviceTypeId,
        String title,
        String description,
        String requesterName,
        String requesterEmail,
        String requesterPhone
) {
}
