package com.lorne.platform.communication.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record ConversationParticipantDto(
        UUID userId,
        UUID workerId,
        String displayName,
        String email,
        String participantRole,
        Instant lastReadAt
) {
}
