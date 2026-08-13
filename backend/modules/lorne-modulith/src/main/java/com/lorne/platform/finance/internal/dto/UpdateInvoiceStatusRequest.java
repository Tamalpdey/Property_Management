package com.lorne.platform.finance.internal.dto;

public record UpdateInvoiceStatusRequest(
        String status,
        String reason
) {
}
