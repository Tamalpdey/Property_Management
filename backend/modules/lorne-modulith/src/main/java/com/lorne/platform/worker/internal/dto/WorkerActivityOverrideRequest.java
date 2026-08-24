package com.lorne.platform.worker.internal.dto;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record WorkerActivityOverrideRequest(
        UUID activityId,
        Boolean delete,
        @Size(max = 40) String activityType,
        @Size(max = 160) String title,
        @Size(max = 160) String locationName,
        @Size(max = 320) String address,
        @Size(max = 1000) String notes,
        Instant startedAt,
        Instant endedAt,
        @Size(max = 1000) String reason
) {
}
