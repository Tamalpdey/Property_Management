package com.lorne.platform.worker.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record WorkerActivityDto(
        UUID id,
        UUID workerId,
        String activityType,
        String title,
        String locationName,
        String address,
        String notes,
        Instant startedAt,
        Instant endedAt,
        Long durationMinutes,
        boolean open,
        boolean override,
        String overrideReason,
        Instant overrideUpdatedAt
) {
}
