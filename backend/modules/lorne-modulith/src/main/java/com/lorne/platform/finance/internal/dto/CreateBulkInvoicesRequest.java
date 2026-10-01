package com.lorne.platform.finance.internal.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record CreateBulkInvoicesRequest(
        LocalDate fromDate,
        LocalDate toDate,
        List<UUID> ownerIds,
        List<UUID> workOrderIds,
        LocalDate issuedOn,
        LocalDate dueOn
) {
}
