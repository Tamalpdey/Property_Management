package com.lorne.platform.notification;

public record OutboundEmailAttachment(
        String filename,
        byte[] content,
        String contentType
) {
}
