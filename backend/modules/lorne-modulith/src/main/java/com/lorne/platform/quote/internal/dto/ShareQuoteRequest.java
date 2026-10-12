package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ShareQuoteRequest(@NotBlank @Size(min = 8, max = 64) String accessPassword) {
}
