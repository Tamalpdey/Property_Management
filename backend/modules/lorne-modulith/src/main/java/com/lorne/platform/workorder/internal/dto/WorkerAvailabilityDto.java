package com.lorne.platform.workorder.internal.dto;

import java.util.UUID;

public record WorkerAvailabilityDto(
        UUID workerId,
        String displayName,
        String employeeNumber,
        String engagementType,
        boolean skillMatched,
        boolean shiftCovered,
        boolean scheduleConflict,
        boolean available,
        String reason
) {
}
