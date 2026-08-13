package com.lorne.platform.tenant.internal.dto;

public record UpdateTenantSettingsRequest(
        String organizationName,
        String billingEmail,
        String supportEmail,
        String phone,
        String websiteUrl,
        String addressLine1,
        String city,
        String provinceCode,
        String postalCode,
        String countryCode,
        String invoicePrefix,
        String invoiceFooter,
        String paymentTerms,
        String logoUrl,
        String themePrimaryColor,
        String themeAccentColor,
        String emailProvider,
        String emailSenderName,
        String emailFromAddress,
        String emailReplyToAddress,
        String smtpHost,
        Integer smtpPort,
        String smtpUsername,
        String smtpPassword,
        Boolean clearSmtpPassword,
        Boolean smtpUseTls
) {
}
