package com.lorne.platform.quote.internal.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
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
        @NotEmpty List<@Valid Line> lines
) {
    public record Line(
            UUID id,
            @NotBlank String description,
            @NotNull @DecimalMin(value = "0.01") BigDecimal quantity,
            String unit,
            @NotNull @DecimalMin("0.0") BigDecimal rate
    ) {
    }
}
