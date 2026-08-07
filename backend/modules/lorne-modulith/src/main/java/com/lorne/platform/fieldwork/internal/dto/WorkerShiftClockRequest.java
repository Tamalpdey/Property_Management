package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;

public record WorkerShiftClockRequest(
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal locationAccuracyMeters,
        String deviceTimestamp,
        String userAgent,
        String platform
) {
}
