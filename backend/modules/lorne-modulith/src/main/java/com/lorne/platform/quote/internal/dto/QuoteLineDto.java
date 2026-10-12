package com.lorne.platform.quote.internal.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record QuoteLineDto(
        UUID id,
        String description,
        BigDecimal quantity,
        String unit,
        BigDecimal rate,
        BigDecimal amount,
        int sortOrder
) {
}
