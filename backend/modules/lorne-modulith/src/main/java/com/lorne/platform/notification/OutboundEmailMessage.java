package com.lorne.platform.notification;

import java.util.List;

public record OutboundEmailMessage(
        String recipient,
        String subject,
        String body,
        List<OutboundEmailAttachment> attachments,
        List<String> ccRecipients,
        List<String> bccRecipients
) {
    public OutboundEmailMessage(String recipient, String subject, String body, List<OutboundEmailAttachment> attachments) {
        this(recipient, subject, body, attachments, List.of(), List.of());
    }

    public OutboundEmailMessage {
        attachments = attachments == null ? List.of() : List.copyOf(attachments);
        ccRecipients = copyEmails(ccRecipients);
        bccRecipients = copyEmails(bccRecipients);
    }

    private static List<String> copyEmails(List<String> values) {
        if (values == null || values.isEmpty()) {
            return List.of();
        }
        return values.stream()
                .filter(value -> value != null && !value.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }
}
