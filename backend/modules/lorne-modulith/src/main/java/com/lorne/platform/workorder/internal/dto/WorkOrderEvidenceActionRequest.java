package com.lorne.platform.workorder.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record WorkOrderEvidenceActionRequest(
        @NotBlank String action,
        @NotNull UUID documentId,
        String photoType,
        String caption,
        BigDecimal receiptAmount,
        String vendorName
) {
}
