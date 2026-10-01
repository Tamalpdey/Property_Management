package com.lorne.platform.finance.internal.dto;

import java.util.List;

public record CreateBulkInvoicesResponse(
        List<InvoiceDto> invoices,
        int skippedWorkOrderCount
) {
}
