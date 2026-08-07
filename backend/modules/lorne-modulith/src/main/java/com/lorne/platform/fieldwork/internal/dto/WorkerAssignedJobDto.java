package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record WorkerAssignedJobDto(
        UUID id,
        String workOrderNumber,
        String title,
        String propertyName,
        String ownerName,
        String address,
        String serviceName,
        String status,
        String priority,
        Instant scheduledStart,
        Instant scheduledEnd,
        String notes,
        boolean leadWorker,
        String assignmentStatus,
        List<ChecklistItemDto> checklist,
        List<MaterialDto> materials,
        List<AssetDto> assets,
        List<FieldNoteDto> fieldNotes,
        List<ExecutionEventDto> executionEvents
) {
    public record ChecklistItemDto(
            UUID id,
            String label,
            String phase,
            boolean required,
            boolean completed,
            String taskStatus
    ) {
    }

    public record MaterialDto(
            UUID id,
            UUID inventoryItemId,
            String itemName,
            String description,
            BigDecimal quantity,
            String unit,
            boolean used,
            Instant usedAt
    ) {
    }

    public record AssetDto(
            UUID assetId,
            String assetType,
            String name,
            String identifier
    ) {
    }

    public record FieldNoteDto(
            UUID id,
            String note,
            String workerName,
            Instant createdAt,
            Instant updatedAt,
            boolean canEdit
    ) {
    }

    public record ExecutionEventDto(
            String action,
            String label,
            String workerName,
            Instant occurredAt,
            String note
    ) {
    }
}
