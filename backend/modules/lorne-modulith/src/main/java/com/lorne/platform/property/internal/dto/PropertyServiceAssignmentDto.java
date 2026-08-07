package com.lorne.platform.property.internal.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record PropertyServiceAssignmentDto(
        UUID id,
        UUID serviceTypeId,
        String serviceName,
        UUID categoryId,
        String categoryName,
        int defaultDurationMinutes,
        BigDecimal basePrice,
        String notes,
        boolean active
) {
}
