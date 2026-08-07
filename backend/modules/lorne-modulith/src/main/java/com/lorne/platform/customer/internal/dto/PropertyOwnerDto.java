package com.lorne.platform.customer.internal.dto;

import java.util.UUID;

public record PropertyOwnerDto(
        UUID id,
        String displayName,
        String email,
        String phone,
        String billingEmail,
        String notes,
        int propertyCount
) {
}
