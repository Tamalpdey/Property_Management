package com.lorne.platform.customer.internal.dto;

import java.util.UUID;

public record PropertyOwnerDto(
        UUID id,
        String ownerCode,
        String displayName,
        String email,
        String phone,
        String billingEmail,
        String addressLine1,
        String addressLine2,
        String city,
        String provinceCode,
        String postalCode,
        String countryCode,
        String notes,
        int propertyCount,
        boolean active
) {
}
