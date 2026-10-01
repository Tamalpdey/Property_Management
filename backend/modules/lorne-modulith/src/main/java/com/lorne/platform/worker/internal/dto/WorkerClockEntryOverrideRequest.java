package com.lorne.platform.worker.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;

public record WorkerClockEntryOverrideRequest(
        @NotNull Instant startedAt,
        @NotNull Instant endedAt,
        @NotBlank String reason
) {
}
