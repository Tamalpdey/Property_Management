package com.lorne.platform.fieldwork.internal.dto;

import jakarta.validation.constraints.Size;

public record WorkerActivityRequest(
        @Size(max = 40) String activityType,
        @Size(max = 160) String title,
        @Size(max = 160) String locationName,
        @Size(max = 320) String address,
        @Size(max = 1000) String notes
) {
}
