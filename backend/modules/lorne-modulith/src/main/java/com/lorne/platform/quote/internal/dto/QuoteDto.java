package com.lorne.platform.quote.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record QuoteDto(
        UUID id,
        String quoteNumber,
        UUID customerId,
        String customerName,
        String customerEmail,
        String customerPhone,
        UUID propertyId,
        String propertyName,
        String propertyAddress,
        UUID serviceTypeId,
        String serviceName,
        String title,
        String scope,
        String status,
        LocalDate issueDate,
        LocalDate validUntil,
        BigDecimal subtotal,
        BigDecimal taxRate,
        BigDecimal taxAmount,
        BigDecimal total,
        String notes,
        String terms,
        String approvalName,
        String approvalComment,
        Instant sentAt,
        Instant viewedAt,
        Instant approvedAt,
        Instant declinedAt,
        Instant convertedAt,
        UUID convertedWorkOrderId,
        String convertedWorkOrderNumber,
        Instant createdAt,
        Instant updatedAt,
        List<QuoteLineDto> lines,
        String templateCode,
        String templateName,
        String pricingMode
) {
}
