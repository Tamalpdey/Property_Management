package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.NotBlank;

public record QuoteDecisionRequest(@NotBlank String name, String comment) {
}
