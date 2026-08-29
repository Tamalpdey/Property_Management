package com.lorne.platform.communication.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record ConversationDto(
        UUID id,
        CommunicationChannelType channelType,
        UUID workOrderId,
        String workOrderNumber,
        String title,
        String lastMessagePreview,
        Instant lastMessageAt,
        int unreadCount,
        List<ConversationParticipantDto> participants
) {
}
