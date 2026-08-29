package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkOrderDto(
        UUID id,
        String workOrderNumber,
        String workOrderType,
        UUID ownerId,
        String ownerCode,
        String ownerName,
        UUID propertyId,
        String propertyCode,
        String propertyName,
        String propertyAddress,
        UUID serviceTypeId,
        String serviceName,
        Map<String, Object> maintenanceRecordTemplate,
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
        List<TaskDto> tasks,
        List<RouteStopDto> routeStops,
        List<LinkedWorkOrderDto> linkedWorkOrders,
        List<LinkedWorkOrderDto> linkedFromWorkOrders,
        List<FieldNoteDto> fieldNotes
) {
    public record AssignmentDto(
            UUID workerId,
            String workerName,
            String workerEmail,
            boolean leadWorker,
            String assignmentStatus,
            String assignmentRole,
            String notes,
            Instant actualTravelStartedAt,
            Instant actualArrivedAt,
            Instant actualWorkStartedAt,
            Instant actualFinishedAt,
            Long actualWorkMinutes,
            Integer estimatedTravelMinutes,
            Integer estimatedTravelDistanceMeters,
            String travelEstimateProvider,
            Instant travelEstimatedAt,
            boolean timingOverride,
            String overrideReason,
            Instant overrideUpdatedAt
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

    public record RouteStopDto(
            UUID id,
            int stopOrder,
            String stopType,
            String name,
            String address,
            String instructions,
            Instant plannedArrival,
            boolean visibleToWorker,
            Integer estimatedTravelMinutes,
            Integer estimatedTravelDistanceMeters,
            String travelEstimateProvider,
            Instant travelEstimatedAt,
            Instant arrivedAt,
            Instant completedAt,
            Instant skippedAt,
            String skippedReason
    ) {
    }

    public record LinkedWorkOrderDto(
            UUID linkedWorkOrderId,
            String workOrderNumber,
            String title,
            String propertyName,
            String status,
            String linkType,
            String notes
    ) {
    }

    public record FieldNoteDto(
            UUID id,
            UUID workerId,
            String workerName,
            String workerEmail,
            String note,
            Instant createdAt,
            Instant updatedAt
    ) {
    }
}
