package com.lorne.platform.customer.internal.dto;

import jakarta.validation.constraints.NotBlank;

public record CreatePropertyOwnerRequest(
        @NotBlank String displayName,
        String email,
        String phone,
        String billingEmail,
        String notes
) {
}
