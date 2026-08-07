package com.lorne.platform.finance.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record SendInvoiceEmailResponse(
        UUID deliveryLogId,
        String status,
        String recipientEmail,
        Instant sentAt
) {
}
