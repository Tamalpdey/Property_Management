package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record OwnerStatementDto(
        UUID ownerId,
        String ownerName,
        String ownerEmail,
        String ownerBillingEmail,
        BigDecimal invoicedTotal,
        BigDecimal paidTotal,
        BigDecimal balanceDue,
        List<InvoiceDto> invoices
) {
}
