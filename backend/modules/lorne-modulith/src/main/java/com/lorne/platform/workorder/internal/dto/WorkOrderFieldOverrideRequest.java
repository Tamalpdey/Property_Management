package com.lorne.platform.workorder.internal.dto;

import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record WorkOrderFieldOverrideRequest(
        @NotBlank String reason,
        List<AssignmentOverride> assignments,
        List<WorkerActivityOverride> workerActivities,
        List<TaskOverride> tasks,
        List<RouteStopOverride> routeStops,
        List<MaterialOverride> materials,
        List<FieldNoteOverride> fieldNotes
) {
    public record AssignmentOverride(
            UUID workerId,
            String assignmentStatus,
            Boolean leadWorker,
            String notes,
            Instant actualArrivedAt,
            Instant actualWorkStartedAt,
            Instant actualFinishedAt,
            Long actualWorkMinutes
    ) {
    }

    public record WorkerActivityOverride(
            UUID activityId,
            UUID workerId,
            Boolean delete,
            String activityType,
            String title,
            String locationName,
            String address,
            String notes,
            Instant startedAt,
            Instant endedAt
    ) {
    }

    public record TaskOverride(
            UUID taskId,
            Boolean completed,
            String taskStatus,
            String notes,
            Instant completedAt
    ) {
    }

    public record RouteStopOverride(
            UUID routeStopId,
            Boolean delete,
            String stopType,
            String name,
            String address,
            String instructions,
            Instant plannedArrival,
            Instant arrivedAt,
            Instant completedAt,
            Instant skippedAt,
            String skippedReason
    ) {
    }

    public record MaterialOverride(
            UUID materialId,
            UUID inventoryItemId,
            String description,
            Boolean used,
            Instant usedAt,
            BigDecimal quantity,
            BigDecimal unitCost
    ) {
    }

    public record FieldNoteOverride(
            UUID noteId,
            UUID workerId,
            String note
    ) {
    }
}
