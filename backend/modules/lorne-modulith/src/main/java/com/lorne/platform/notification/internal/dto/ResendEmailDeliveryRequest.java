package com.lorne.platform.notification.internal.dto;

public record ResendEmailDeliveryRequest(
        String recipientEmail,
        String ccEmails,
        String bccEmails
) {
}
