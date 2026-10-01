package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record WorkerDailyLoadoutDto(
        UUID id,
        LocalDate date,
        UUID workerId,
        String workerName,
        String status,
        int scheduledJobs,
        int toolCount,
        int checkedOutCount,
        int returnedCount,
        int issueCount,
        List<ToolItemDto> tools,
        List<MaterialItemDto> materials,
        List<ActivityItemDto> activities,
        List<VehicleOptionDto> vehicles,
        VehicleUseDto vehicleUse
) {
    public record VehicleOptionDto(
            UUID id,
            String name,
            String identifier
    ) {
    }

    public record VehicleUseDto(
            UUID id,
            UUID vehicleAssetId,
            String vehicleLabel,
            BigDecimal startKm,
            BigDecimal endKm,
            String notes
    ) {
    }

    public record ToolItemDto(
            UUID assetId,
            UUID workOrderId,
            String workOrderNumber,
            String workOrderTitle,
            String propertyName,
            String assetType,
            String name,
            String identifier,
            String status,
            String issueNote
    ) {
    }

    public record MaterialItemDto(
            UUID materialId,
            UUID inventoryItemId,
            UUID workOrderId,
            String workOrderNumber,
            String workOrderTitle,
            String propertyName,
            String itemName,
            String description,
            BigDecimal quantity,
            String unit,
            boolean used
    ) {
    }

    public record ActivityItemDto(
            UUID id,
            String activityType,
            String title,
            String locationName,
            String address,
            String notes,
            Instant startedAt,
            Instant endedAt,
            Long durationMinutes,
            boolean open
    ) {
    }
}
