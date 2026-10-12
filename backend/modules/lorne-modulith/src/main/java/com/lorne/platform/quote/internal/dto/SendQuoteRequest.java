package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendQuoteRequest(
        @Email String recipientEmail,
        String subject,
        String message,
        @NotBlank @Size(min = 8, max = 64) String accessPassword
) {
}
