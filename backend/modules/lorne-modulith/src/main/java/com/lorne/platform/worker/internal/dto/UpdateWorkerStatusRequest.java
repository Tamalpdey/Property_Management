package com.lorne.platform.worker.internal.dto;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public record UpdateWorkerStatusRequest(
        @NotBlank String status,
        LocalDate leaveStartDate,
        LocalDate leaveEndDate,
        String leaveReason
) {
}
