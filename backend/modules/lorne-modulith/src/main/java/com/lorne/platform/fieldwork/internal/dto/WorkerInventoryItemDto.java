package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record WorkerInventoryItemDto(
        UUID id,
        String categoryName,
        String name,
        String unit,
        BigDecimal billingCost,
        BigDecimal quantityOnHand,
        String storageLocation,
        boolean active
) {
}
