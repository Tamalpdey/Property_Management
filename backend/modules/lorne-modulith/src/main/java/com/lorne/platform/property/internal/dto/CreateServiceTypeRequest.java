package com.lorne.platform.property.internal.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.UUID;

public record CreateServiceTypeRequest(
        UUID categoryId,
        @NotBlank String name,
        String description,
        Integer defaultDurationMinutes,
        BigDecimal basePrice
) {
}
