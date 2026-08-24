package com.lorne.platform.worker.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record WorkerClockEntryDto(
        UUID id,
        UUID workerId,
        Instant startedAt,
        Instant endedAt,
        Long durationMinutes,
        Long pauseMinutes
) {
}
