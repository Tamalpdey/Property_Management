package com.lorne.platform.workorder.internal.dto;

import java.util.Map;

public record UpsertWorkOrderMaintenanceRecordRequest(
        Map<String, Object> templateSnapshot,
        Map<String, Object> recordData,
        String note
) {
}
