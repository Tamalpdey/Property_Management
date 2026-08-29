package com.lorne.platform.publicintake.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PublicMaintenanceRequest(
        @Size(max = 80) String tenantKey,
        @Size(max = 160) String sourceDomain,
        @Size(max = 600) String sourceUrl,
        @NotBlank @Size(max = 160) String name,
        @Email @Size(max = 254) String email,
        @Size(max = 40) String phone,
        @NotBlank @Size(max = 300) String propertyAddress,
        @Size(max = 120) String serviceRequested,
        @NotBlank @Size(max = 4000) String message
) {
}
