package com.lorne.platform.communication.internal.dto;

import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record CreateConversationRequest(
        CommunicationChannelType channelType,
        UUID workOrderId,
        List<UUID> participantUserIds,
        @Size(max = 180) String title,
        @Size(max = 4000) String initialMessage
) {
}
