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
        BigDecimal paidTotal,
        BigDecimal balanceDue,
        UUID customerId,
        String ownerCode,
        String ownerName,
        String ownerEmail,
        String ownerBillingEmail,
        String ownerAddress,
        UUID workOrderId,
        String workOrderNumber,
        String workOrderTitle,
        String propertyCode,
        String propertyName,
        String propertyAddress,
        Instant createdAt,
        List<InvoiceWorkOrderDto> workOrders,
        List<InvoiceLineDto> lines,
        List<PaymentDto> payments
) {
    public record InvoiceWorkOrderDto(
            UUID workOrderId,
            String workOrderNumber,
            String title,
            String propertyCode,
            String propertyName,
            String propertyAddress,
            String status,
            String serviceName,
            Instant scheduledStart,
            Instant scheduledEnd
    ) {
    }

    public record InvoiceLineDto(
            UUID id,
            UUID workOrderId,
            String lineType,
            String description,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal,
            boolean taxable,
            BigDecimal taxRate
    ) {
    }

    public record PaymentDto(
            UUID id,
            String status,
            String paymentMethod,
            BigDecimal amount,
            Instant paidAt,
            String reference,
            String note,
            Instant createdAt
    ) {
    }
}
