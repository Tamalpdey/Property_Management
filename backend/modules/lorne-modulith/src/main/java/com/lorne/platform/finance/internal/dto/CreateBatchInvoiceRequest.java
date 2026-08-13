package com.lorne.platform.finance.internal.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateBatchInvoiceRequest(
        UUID ownerId,
        UUID propertyId,
        List<UUID> workOrderIds,
        List<InvoiceLineRequest> additionalLines,
        LocalDate issuedOn,
        LocalDate dueOn
) {
}
