package com.lorne.platform.superadmin.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateTenantOnboardingRequest(
        @NotBlank @Size(max = 160) String legalName,
        @NotBlank @Size(max = 120) String displayName,
        @NotBlank @Size(max = 40) String portalSubdomain,
        @NotBlank @Size(max = 40) String planCode,
        @NotBlank String status,
        @NotBlank @Size(max = 80) String timezone,
        @NotBlank @Size(min = 2, max = 2) String countryCode,
        @Size(max = 40) String provinceCode,
        @NotBlank @Size(max = 120) String adminDisplayName,
        @Email @NotBlank @Size(max = 200) String adminEmail,
        @Size(max = 40) String adminPhone,
        @NotBlank @Size(min = 8, max = 200) String temporaryPassword,
        @Email @Size(max = 200) String billingEmail,
        @Email @Size(max = 200) String supportEmail,
        @Size(max = 40) String companyPhone,
        @Size(max = 300) String websiteUrl,
        @Size(max = 240) String addressLine1,
        @Size(max = 240) String addressLine2,
        @Size(max = 120) String city,
        @Size(max = 24) String postalCode,
        @Size(max = 7) String themePrimaryColor,
        @Size(max = 7) String themeAccentColor,
        @Size(max = 7) String themeNavigationColor,
        @Size(max = 120) String loginHeadline,
        @Size(max = 300) String loginMessage
) {
}
