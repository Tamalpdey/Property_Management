package com.lorne.platform.property.internal.dto;

import java.util.List;
import java.util.UUID;

public record PropertyDto(
        UUID id,
        String propertyCode,
        UUID ownerId,
        String ownerCode,
        String ownerName,
        String name,
        String addressLine1,
        String addressLine2,
        String city,
        String provinceCode,
        String postalCode,
        String countryCode,
        String serviceNotes,
        boolean active,
        List<PropertyServiceAssignmentDto> services
) {
}
