package com.lorne.platform.property.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.util.Map;

public record CreateServiceCategoryRequest(
        @NotBlank String name,
        @DecimalMin(value = "0.0", inclusive = true) BigDecimal wsibRatePercent,
        Map<String, Object> maintenanceRecordTemplate
) {
}
