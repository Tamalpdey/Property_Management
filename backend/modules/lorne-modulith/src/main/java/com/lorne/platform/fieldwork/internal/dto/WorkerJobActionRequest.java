package com.lorne.platform.fieldwork.internal.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record WorkerJobActionRequest(
        String action,
        String note,
        UUID noteId,
        UUID taskId,
        UUID routeStopId,
        UUID materialId,
        UUID inventoryItemId,
        String materialDescription,
        BigDecimal quantity,
        BigDecimal unitCost,
        UUID assetId,
        UUID documentId,
        String photoType,
        String caption,
        BigDecimal receiptAmount,
        String vendorName,
        BigDecimal latitude,
        BigDecimal longitude,
        BigDecimal locationAccuracyMeters,
        String deviceTimestamp,
        String userAgent,
        String platform
) {
}
