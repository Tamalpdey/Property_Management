package com.lorne.platform.notification;

public record OutboundEmailInlineImage(
        String contentId,
        byte[] content,
        String contentType
) {
}
