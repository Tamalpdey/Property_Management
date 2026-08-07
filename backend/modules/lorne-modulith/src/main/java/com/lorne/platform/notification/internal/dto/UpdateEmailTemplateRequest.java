package com.lorne.platform.notification.internal.dto;

public record UpdateEmailTemplateRequest(
        String subject,
        String body
) {
}
