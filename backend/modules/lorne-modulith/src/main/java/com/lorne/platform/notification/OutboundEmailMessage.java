package com.lorne.platform.notification;

import java.util.List;

public record OutboundEmailMessage(
        String recipient,
        String subject,
        String body,
        List<OutboundEmailAttachment> attachments
) {
}
