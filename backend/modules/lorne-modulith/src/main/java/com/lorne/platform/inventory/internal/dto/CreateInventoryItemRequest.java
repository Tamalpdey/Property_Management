package com.lorne.platform.inventory.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record CreateInventoryItemRequest(
        UUID categoryId,
        @NotBlank String name,
        @NotBlank String unit,
        @NotNull BigDecimal quantityOnHand,
        BigDecimal reorderLevel,
        String storageLocation
) {
}
