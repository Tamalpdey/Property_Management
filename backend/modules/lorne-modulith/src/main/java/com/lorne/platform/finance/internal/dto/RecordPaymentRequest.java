package com.lorne.platform.finance.internal.dto;

import java.math.BigDecimal;
import java.time.Instant;

public record RecordPaymentRequest(
        BigDecimal amount,
        String paymentMethod,
        Instant paidAt,
        String reference,
        String note
) {
}
