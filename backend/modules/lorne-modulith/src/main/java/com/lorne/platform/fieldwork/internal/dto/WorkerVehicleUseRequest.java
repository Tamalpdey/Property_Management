package com.lorne.platform.fieldwork.internal.dto;

import jakarta.validation.constraints.DecimalMin;
import java.math.BigDecimal;
import java.util.UUID;

public record WorkerVehicleUseRequest(
        UUID vehicleAssetId,
        String vehicleLabel,
        @DecimalMin("0.0") BigDecimal startKm,
        @DecimalMin("0.0") BigDecimal endKm,
        String notes
) {
}
