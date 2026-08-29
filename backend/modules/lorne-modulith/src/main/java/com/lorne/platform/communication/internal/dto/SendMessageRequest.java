package com.lorne.platform.communication.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendMessageRequest(
        @NotBlank @Size(max = 4000) String body
) {
}
