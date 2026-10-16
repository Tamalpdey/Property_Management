package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record SendQuoteRequest(
        @Email String recipientEmail,
        String subject,
        String message,
        @Size(max = 64) String accessPassword
) {
}
