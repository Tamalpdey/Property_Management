package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record BulkInvoicePreviewDto(
        LocalDate fromDate,
        LocalDate toDate,
        int ownerCount,
        int workOrderCount,
        BigDecimal estimatedSubtotal,
        List<OwnerGroupDto> owners
) {
    public record OwnerGroupDto(
            UUID ownerId,
            String ownerCode,
            String ownerName,
            String ownerEmail,
            String ownerBillingEmail,
            int workOrderCount,
            BigDecimal estimatedSubtotal,
            List<WorkOrderDto> workOrders
    ) {
    }

    public record WorkOrderDto(
            UUID workOrderId,
            String workOrderNumber,
            String title,
            String status,
            UUID propertyId,
            String propertyCode,
            String propertyName,
            String propertyAddress,
            String serviceName,
            Instant scheduledStart,
            Instant scheduledEnd,
            BigDecimal estimatedSubtotal
    ) {
    }
}
