package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkerAssignedJobDto(
        UUID id,
        String workOrderNumber,
        String workOrderType,
        String title,
        String propertyCode,
        String propertyName,
        String ownerCode,
        String ownerName,
        String address,
        String serviceName,
        Map<String, Object> maintenanceRecordTemplate,
        String status,
        String priority,
        Instant scheduledStart,
        Instant scheduledEnd,
        Integer estimatedTravelMinutes,
        Integer estimatedTravelDistanceMeters,
        String travelEstimateProvider,
        Instant travelEstimatedAt,
        String notes,
        boolean leadWorker,
        String assignmentStatus,
        List<ChecklistItemDto> checklist,
        List<MaterialDto> materials,
        List<AssetDto> assets,
        List<RouteStopDto> routeStops,
        List<LinkedWorkOrderDto> linkedWorkOrders,
        List<LinkedWorkOrderDto> linkedFromWorkOrders,
        List<FieldNoteDto> fieldNotes,
        List<EvidenceDto> evidence,
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
            String note,
            String workerName,
            Instant createdAt,
            Instant updatedAt,
            boolean canEdit
    ) {
    }

    public record EvidenceDto(
            UUID documentId,
            String documentType,
            String photoType,
            String caption,
            String viewUrl,
            String contentType,
            Long byteSize,
            String createdByName,
            Instant createdAt,
            boolean canDelete
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
