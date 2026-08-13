package com.lorne.platform.fieldwork.internal.dto;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record WorkerLoadoutToolActionRequest(
        @NotNull UUID workOrderId,
        @NotNull UUID assetId,
        String note
) {
}
