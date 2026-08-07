package com.lorne.platform.fieldwork.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record WorkerShiftClockDto(
        boolean clockedIn,
        UUID entryId,
        Instant startedAt,
        Instant endedAt
) {
}
