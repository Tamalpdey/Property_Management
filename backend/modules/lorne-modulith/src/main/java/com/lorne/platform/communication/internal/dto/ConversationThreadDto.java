package com.lorne.platform.communication.internal.dto;

import java.util.List;

public record ConversationThreadDto(
        ConversationDto conversation,
        List<ConversationMessageDto> messages
) {
}
