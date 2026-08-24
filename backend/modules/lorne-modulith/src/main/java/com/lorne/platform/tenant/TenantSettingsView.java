package com.lorne.platform.tenant;

public record TenantSettingsView(
        String tenantName,
        String legalName,
        String timezone,
        String countryCode,
        String organizationName,
        String billingEmail,
        String supportEmail,
        String phone,
        String websiteUrl,
        String addressLine1,
        String city,
        String provinceCode,
        String postalCode,
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
        boolean smtpPasswordConfigured,
        boolean smtpUseTls,
        String graphTenantId,
        String graphClientId,
        String graphClientSecret,
        boolean graphClientSecretConfigured,
        String graphSenderUser,
        boolean autoSendWorkCompletedEmail,
        boolean autoSendInvoiceEmail
) {
    public String invoiceBrandName() {
        return firstNonBlank(organizationName, tenantName, legalName, "Lorne PropertyOps");
    }

    public String effectiveBillingEmail(String fallback) {
        return firstNonBlank(billingEmail, emailReplyToAddress, emailFromAddress, fallback);
    }

    public String effectiveSupportEmail(String fallback) {
        return firstNonBlank(supportEmail, emailReplyToAddress, emailFromAddress, fallback);
    }

    public String effectiveSenderName() {
        return firstNonBlank(emailSenderName, invoiceBrandName());
    }

    public String effectiveFromAddress(String fallback) {
        return firstNonBlank(emailFromAddress, fallback);
    }

    public String effectiveReplyToAddress() {
        return firstNonBlank(emailReplyToAddress, supportEmail, billingEmail, emailFromAddress);
    }

    public String effectiveGraphSenderUser() {
        return firstNonBlank(graphSenderUser, emailFromAddress);
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }
}
