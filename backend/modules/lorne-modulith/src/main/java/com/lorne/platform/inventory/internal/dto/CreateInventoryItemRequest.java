package com.lorne.platform.inventory.internal.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record CreateInventoryItemRequest(
        UUID categoryId,
        @NotBlank String name,
        @NotBlank String unit,
        @DecimalMin("0.00") BigDecimal unitCost,
        @DecimalMin("0.00") BigDecimal billingCost,
        @NotNull BigDecimal quantityOnHand,
        BigDecimal reorderLevel,
        String storageLocation
) {
}
