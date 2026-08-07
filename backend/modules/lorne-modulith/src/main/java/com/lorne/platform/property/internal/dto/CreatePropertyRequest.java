package com.lorne.platform.property.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record CreatePropertyRequest(
        @NotNull UUID ownerId,
        @NotBlank String name,
        @NotBlank String addressLine1,
        String addressLine2,
        @NotBlank String city,
        String provinceCode,
        String postalCode,
        String countryCode,
        String serviceNotes
) {
}
