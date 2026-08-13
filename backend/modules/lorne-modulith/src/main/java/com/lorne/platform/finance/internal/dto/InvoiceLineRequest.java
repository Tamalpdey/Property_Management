package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;

public record InvoiceLineRequest(
        String lineType,
        String description,
        BigDecimal quantity,
        BigDecimal unitPrice,
        Boolean taxable,
        BigDecimal taxRate
) {
}
