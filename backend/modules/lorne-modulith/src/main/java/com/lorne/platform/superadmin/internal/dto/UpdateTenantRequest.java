package com.lorne.platform.superadmin.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UpdateTenantRequest(
        @NotBlank @Size(max = 160) String legalName,
        @NotBlank @Size(max = 120) String displayName,
        @NotBlank @Size(max = 40) String portalSubdomain,
        @NotBlank @Size(max = 40) String planCode,
        @NotBlank String status,
        @NotBlank @Size(max = 80) String timezone,
        @NotBlank @Size(min = 2, max = 2) String countryCode,
        @Size(max = 40) String provinceCode,
        @NotBlank @Size(max = 160) String organizationName,
        @Email @Size(max = 200) String billingEmail,
        @Email @Size(max = 200) String supportEmail,
        @Size(max = 40) String companyPhone,
        @Size(max = 300) String websiteUrl,
        @Size(max = 240) String addressLine1,
        @Size(max = 240) String addressLine2,
        @Size(max = 120) String city,
        @Size(max = 24) String postalCode
) { }
