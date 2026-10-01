package com.lorne.platform.workorder.internal.dto;

import java.util.List;
import java.util.UUID;

public record RefreshWorkOrderTravelEstimatesRequest(
        List<UUID> workOrderIds
) {
}
