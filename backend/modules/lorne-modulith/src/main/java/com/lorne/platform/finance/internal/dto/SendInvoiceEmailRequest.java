package com.lorne.platform.finance.internal.dto;

import java.util.UUID;

public record SendInvoiceEmailRequest(
        UUID templateId,
        String recipientEmail,
        String ccEmails,
        String bccEmails,
        String subject,
        String body,
        String deliveryMode
) {
}
