package com.lorne.platform.fieldwork.internal.dto;

public record WorkerJobActionResponse(
        WorkerAssignedJobDto job,
        String message
) {
}
