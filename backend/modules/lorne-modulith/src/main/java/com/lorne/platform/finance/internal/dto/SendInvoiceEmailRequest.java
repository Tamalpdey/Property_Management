package com.lorne.platform.finance.internal.dto;

import java.util.UUID;

public record SendInvoiceEmailRequest(
        UUID templateId,
        String recipientEmail,
        String subject,
        String body
) {
}
