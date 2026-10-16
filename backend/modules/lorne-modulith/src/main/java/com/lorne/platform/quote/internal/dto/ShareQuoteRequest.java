package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.Size;

public record ShareQuoteRequest(@Size(max = 64) String accessPassword) {
}
