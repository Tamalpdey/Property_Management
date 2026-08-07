package com.lorne.platform.asset.internal.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.util.UUID;

public record CreateAssetRequest(
        @NotBlank String assetType,
        @NotBlank String name,
        String identifier,
        BigDecimal quantityOnHand,
        String storageLocation,
        UUID assignedWorkerId
) {
}
