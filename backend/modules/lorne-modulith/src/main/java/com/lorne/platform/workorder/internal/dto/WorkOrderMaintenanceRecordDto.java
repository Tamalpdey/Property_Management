package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record WorkOrderMaintenanceRecordDto(
        UUID id,
        UUID workOrderId,
        UUID workerId,
        UUID actorUserId,
        String workerName,
        String workerEmail,
        Map<String, Object> templateSnapshot,
        Map<String, Object> recordData,
        String note,
        Instant createdAt,
        Instant updatedAt
) {
}
