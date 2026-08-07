package com.lorne.platform.workorder.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record CreateWorkOrderRequest(
        @NotNull UUID propertyId,
        UUID serviceTypeId,
        UUID assignedWorkerId,
        List<UUID> assignedWorkerIds,
        UUID leadWorkerId,
        @NotBlank String title,
        String description,
        String source,
        String status,
        String priority,
        Instant scheduledStart,
        Instant scheduledEnd,
        String requesterName,
        String requesterEmail,
        String requesterPhone,
        String recurrenceRule,
        Integer recurrenceInterval,
        LocalDate recurrenceUntil,
        List<MaterialRequest> materials,
        List<UUID> assetIds,
        List<String> tasks,
        List<TaskRequest> taskItems
) {
    public record MaterialRequest(
            UUID id,
            UUID inventoryItemId,
            String description,
            @NotNull BigDecimal quantity,
            BigDecimal unitCost
    ) {
    }

    public record TaskRequest(
            UUID id,
            @NotBlank String label,
            Integer parentIndex,
            UUID assignedWorkerId,
            String phase,
            Boolean required,
            String notes
    ) {
    }
}
