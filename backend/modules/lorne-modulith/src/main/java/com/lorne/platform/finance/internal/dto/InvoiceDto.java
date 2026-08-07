package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record InvoiceDto(
        UUID id,
        String invoiceNumber,
        String status,
        LocalDate issuedOn,
        LocalDate dueOn,
        BigDecimal subtotal,
        BigDecimal taxTotal,
        BigDecimal total,
        UUID customerId,
        String ownerName,
        String ownerEmail,
        String ownerBillingEmail,
        UUID workOrderId,
        String workOrderNumber,
        String workOrderTitle,
        String propertyName,
        String propertyAddress,
        Instant createdAt,
        List<InvoiceLineDto> lines
) {
    public record InvoiceLineDto(
            UUID id,
            String description,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal
    ) {
    }
}
