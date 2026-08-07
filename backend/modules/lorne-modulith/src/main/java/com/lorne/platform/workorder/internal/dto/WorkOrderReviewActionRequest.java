package com.lorne.platform.workorder.internal.dto;

public record WorkOrderReviewActionRequest(
        String action,
        String note
) {
}
