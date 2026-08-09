package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;

public record InvoiceLineRequest(
        String description,
        BigDecimal quantity,
        BigDecimal unitPrice
) {
}
