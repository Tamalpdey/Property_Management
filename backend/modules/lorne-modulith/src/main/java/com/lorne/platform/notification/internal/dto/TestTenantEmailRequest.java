package com.lorne.platform.notification.internal.dto;

public record TestTenantEmailRequest(
        String recipientEmail,
        String subject,
        String body
) {
}
