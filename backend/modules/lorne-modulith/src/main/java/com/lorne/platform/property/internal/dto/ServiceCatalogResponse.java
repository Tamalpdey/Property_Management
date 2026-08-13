package com.lorne.platform.property.internal.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record ServiceCatalogResponse(List<ServiceCategoryDto> categories, List<ServiceTypeDto> serviceTypes) {
    public record ServiceCategoryDto(UUID id, String name, boolean active) {
    }

    public record ServiceTypeDto(
            UUID id,
            UUID categoryId,
            String categoryName,
            String name,
            String description,
            int defaultDurationMinutes,
            BigDecimal basePrice,
            Map<String, Object> maintenanceRecordTemplate,
            boolean active
    ) {
    }
}
