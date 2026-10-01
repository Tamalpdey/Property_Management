package com.lorne.platform.worker.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record WorkerClockedInTodayDto(
        UUID workerId,
        String workerName,
        String employeeNumber,
        String email,
        Instant startedAt,
        boolean paused,
        Instant pausedAt,
        Long grossMinutes,
        Long pauseMinutes,
        Long netMinutes
) {
}
