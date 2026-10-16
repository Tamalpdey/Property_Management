package com.lorne.platform.quote.internal.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record UpsertQuoteRequest(
        UUID customerId,
        String adhocCustomerName,
        String adhocCustomerEmail,
        String adhocCustomerPhone,
        UUID propertyId,
        String adhocPropertyName,
        String adhocPropertyAddress,
        UUID serviceTypeId,
        @NotBlank String title,
        String scope,
        LocalDate issueDate,
        LocalDate validUntil,
        @DecimalMin("0.0") BigDecimal taxRate,
        String notes,
        String terms,
        @NotEmpty @jakarta.validation.constraints.Size(max = 200) List<@Valid Line> lines,
        String templateCode,
        @DecimalMin("0.0") @jakarta.validation.constraints.DecimalMax("9999999999.99") BigDecimal totalPrice
) {
    public UpsertQuoteRequest(UUID customerId, String adhocCustomerName, String adhocCustomerEmail, String adhocCustomerPhone,
            UUID propertyId, String adhocPropertyName, String adhocPropertyAddress, UUID serviceTypeId, String title,
            String scope, LocalDate issueDate, LocalDate validUntil, BigDecimal taxRate, String notes, String terms, List<Line> lines) {
        this(customerId, adhocCustomerName, adhocCustomerEmail, adhocCustomerPhone, propertyId, adhocPropertyName,
                adhocPropertyAddress, serviceTypeId, title, scope, issueDate, validUntil, taxRate, notes, terms, lines, null, null);
    }
    public record Line(
            UUID id,
            @NotBlank @jakarta.validation.constraints.Size(max = 4000) String description,
            @DecimalMin(value = "0.01") BigDecimal quantity,
            String unit,
            @DecimalMin("0.0") BigDecimal rate
    ) {
    }
}
