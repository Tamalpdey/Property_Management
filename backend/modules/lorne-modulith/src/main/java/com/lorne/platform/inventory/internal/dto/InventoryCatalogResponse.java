package com.lorne.platform.inventory.internal.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record InventoryCatalogResponse(List<InventoryCategoryDto> categories, List<InventoryItemDto> items) {
    public record InventoryCategoryDto(UUID id, String name) {
    }

    public record InventoryItemDto(
            UUID id,
            UUID categoryId,
            String categoryName,
            String name,
            String unit,
            BigDecimal quantityOnHand,
            BigDecimal reorderLevel,
            String storageLocation
    ) {
    }
}
