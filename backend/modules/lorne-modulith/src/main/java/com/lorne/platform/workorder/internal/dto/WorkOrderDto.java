package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record WorkOrderDto(
        UUID id,
        String workOrderNumber,
        UUID ownerId,
        String ownerName,
        UUID propertyId,
        String propertyName,
        String propertyAddress,
        UUID serviceTypeId,
        String serviceName,
        String title,
        String description,
        String status,
        String source,
        String priority,
        Instant scheduledStart,
        Instant scheduledEnd,
        String requesterName,
        String requesterEmail,
        String requesterPhone,
        String recurrenceRule,
        Integer recurrenceInterval,
        LocalDate recurrenceUntil,
        List<AssignmentDto> assignments,
        List<MaterialDto> materials,
        List<AssetDto> assets,
        List<TaskDto> tasks
) {
    public record AssignmentDto(
            UUID workerId,
            String workerName,
            String workerEmail,
            boolean leadWorker,
            String assignmentStatus,
            String assignmentRole,
            String notes
    ) {
    }

    public record MaterialDto(
            UUID id,
            UUID inventoryItemId,
            String itemName,
            String description,
            BigDecimal quantity,
            String unit,
            BigDecimal unitCost,
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

    public record TaskDto(
            UUID id,
            UUID parentTaskId,
            UUID assignedWorkerId,
            String assignedWorkerName,
            String label,
            int sortOrder,
            String phase,
            boolean required,
            boolean completed,
            String taskStatus,
            String notes
    ) {
    }
}
