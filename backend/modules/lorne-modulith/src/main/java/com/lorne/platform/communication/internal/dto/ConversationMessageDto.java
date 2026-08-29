package com.lorne.platform.communication.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record ConversationMessageDto(
        UUID id,
        UUID conversationId,
        UUID senderUserId,
        UUID senderWorkerId,
        String senderName,
        String senderEmail,
        String senderRole,
        String body,
        Instant createdAt,
        boolean mine
) {
}
