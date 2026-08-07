package com.lorne.platform.asset.internal.dto;

import java.util.List;
import java.util.UUID;

public record AssetCatalogResponse(List<AssetDto> assets, List<WorkerOptionDto> workers) {
    public record AssetDto(
            UUID id,
            String assetType,
            String name,
            String identifier,
            java.math.BigDecimal quantityOnHand,
            String storageLocation,
            UUID assignedWorkerId,
            String assignedWorkerName,
            boolean active
    ) {
    }

    public record WorkerOptionDto(UUID id, String displayName, String employeeNumber) {
    }
}
