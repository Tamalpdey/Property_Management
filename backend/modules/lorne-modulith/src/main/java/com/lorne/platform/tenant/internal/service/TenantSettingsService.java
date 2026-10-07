package com.lorne.platform.tenant.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.tenant.TenantSettingsView;
import com.lorne.platform.tenant.internal.dto.TenantSettingsDto;
import com.lorne.platform.tenant.internal.dto.UpdateTenantSettingsRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantSettingsService implements TenantSettingsOperations {
    private static final Pattern HEX_COLOR = Pattern.compile("^#[0-9A-Fa-f]{6}$");

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public TenantSettingsService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    @Override
    public TenantSettingsView settings(UUID tenantId) {
        var settings = jdbcTemplate.query("""
                SELECT t.display_name AS tenant_name, t.legal_name, t.timezone, t.country_code AS tenant_country_code,
                       ts.organization_name, ts.billing_email, ts.support_email, ts.phone, ts.website_url,
                       ts.address_line1, ts.address_line2, ts.city, ts.province_code, ts.postal_code, ts.country_code,
                       coalesce(ts.invoice_prefix, 'INV') AS invoice_prefix,
                       coalesce(ts.invoice_tax_rate, 0.13) AS invoice_tax_rate,
                       ts.tax_registration_number,
                       ts.invoice_footer, ts.payment_terms,
                       ts.logo_url,
                       coalesce(ts.day_ticket_show_company_name, true) AS day_ticket_show_company_name,
                       coalesce(ts.day_ticket_show_company_address, true) AS day_ticket_show_company_address,
                       coalesce(ts.service_record_show_company_name, false) AS service_record_show_company_name,
                       coalesce(ts.service_record_show_company_address, false) AS service_record_show_company_address,
                       coalesce(ts.invoice_show_company_name, false) AS invoice_show_company_name,
                       coalesce(ts.invoice_show_company_address, false) AS invoice_show_company_address,
                       coalesce(ts.theme_primary_color, '#0f766e') AS theme_primary_color,
                       coalesce(ts.theme_accent_color, '#2563eb') AS theme_accent_color,
                       coalesce(ts.email_provider, 'SYSTEM') AS email_provider,
                       ts.email_sender_name, ts.email_from_address, ts.email_reply_to_address,
                       ts.smtp_host, ts.smtp_port, ts.smtp_username, ts.smtp_password,
                       ts.smtp_password IS NOT NULL AS smtp_password_configured,
                       coalesce(ts.smtp_use_tls, true) AS smtp_use_tls,
                       ts.graph_tenant_id, ts.graph_client_id, ts.graph_client_secret,
                       ts.graph_client_secret IS NOT NULL AS graph_client_secret_configured,
                       ts.graph_sender_user,
                       coalesce(ts.auto_send_work_completed_email, false) AS auto_send_work_completed_email,
                       coalesce(ts.auto_send_invoice_email, false) AS auto_send_invoice_email,
                       coalesce(ts.live_worker_tracking_enabled, false) AS live_worker_tracking_enabled
                FROM tenants t
                LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
                WHERE t.id = ?
                """, rs -> {
            if (!rs.next()) {
                return null;
            }
            return mapView(rs);
        }, tenantId);
        if (settings == null) {
            throw new ResourceNotFoundException("Tenant settings not found.");
        }
        return settings;
    }

    @Transactional(readOnly = true)
    public TenantSettingsDto get(UUID tenantId) {
        return toDto(settings(tenantId));
    }

    @Transactional
    public TenantSettingsDto update(UUID tenantId, UUID actorUserId, UpdateTenantSettingsRequest request) {
        var safeRequest = request == null ? new UpdateTenantSettingsRequest(
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null
        ) : request;
        var provider = provider(safeRequest.emailProvider());
        var primaryColor = color(safeRequest.themePrimaryColor(), "#0f766e", "Primary color must use #RRGGBB format.");
        var accentColor = color(safeRequest.themeAccentColor(), "#2563eb", "Accent color must use #RRGGBB format.");
        var invoiceTaxRate = taxRate(safeRequest.invoiceTaxRate());
        var invoicePrefix = firstNonBlank(safeRequest.invoicePrefix(), "INV").toUpperCase(Locale.ROOT);
        if (invoicePrefix.length() > 12) {
            throw new BadRequestException("Invoice prefix must be 12 characters or fewer.");
        }
        var smtpPort = safeRequest.smtpPort();
        if (smtpPort != null && (smtpPort < 1 || smtpPort > 65535)) {
            throw new BadRequestException("SMTP port must be between 1 and 65535.");
        }

        jdbcTemplate.update("""
                INSERT INTO tenant_settings (tenant_id, created_by, updated_by)
                VALUES (?, ?, ?)
                ON CONFLICT (tenant_id) DO NOTHING
                """, tenantId, actorUserId, actorUserId);
        jdbcTemplate.update("""
                UPDATE tenant_settings
                SET organization_name = ?, billing_email = ?, support_email = ?, phone = ?, website_url = ?,
                    address_line1 = ?, address_line2 = ?, city = ?, province_code = ?, postal_code = ?, country_code = ?,
                    invoice_prefix = ?, invoice_tax_rate = ?, tax_registration_number = ?, invoice_footer = ?, payment_terms = ?, logo_url = ?,
                    day_ticket_show_company_name = ?, day_ticket_show_company_address = ?,
                    service_record_show_company_name = ?, service_record_show_company_address = ?,
                    invoice_show_company_name = ?, invoice_show_company_address = ?,
                    theme_primary_color = ?, theme_accent_color = ?,
                    email_provider = ?, email_sender_name = ?, email_from_address = ?, email_reply_to_address = ?,
                    smtp_host = ?, smtp_port = ?, smtp_username = ?, smtp_use_tls = ?,
                    smtp_password = CASE
                        WHEN CAST(? AS boolean) THEN NULL
                        WHEN CAST(? AS boolean) THEN CAST(? AS text)
                        ELSE smtp_password
                    END,
                    graph_tenant_id = ?, graph_client_id = ?, graph_sender_user = ?,
                    graph_client_secret = CASE
                        WHEN CAST(? AS boolean) THEN NULL
                        WHEN CAST(? AS boolean) THEN CAST(? AS text)
                        ELSE graph_client_secret
                    END,
                    auto_send_work_completed_email = ?,
                    auto_send_invoice_email = ?,
                    live_worker_tracking_enabled = ?,
                    updated_by = ?, updated_at = now()
                WHERE tenant_id = ?
                """,
                text(safeRequest.organizationName()),
                text(safeRequest.billingEmail()),
                text(safeRequest.supportEmail()),
                text(safeRequest.phone()),
                text(safeRequest.websiteUrl()),
                text(safeRequest.addressLine1()),
                text(safeRequest.addressLine2()),
                text(safeRequest.city()),
                text(safeRequest.provinceCode()),
                text(safeRequest.postalCode()),
                text(safeRequest.countryCode()),
                invoicePrefix,
                invoiceTaxRate,
                text(safeRequest.taxRegistrationNumber()),
                text(safeRequest.invoiceFooter()),
                text(safeRequest.paymentTerms()),
                text(safeRequest.logoUrl()),
                safeRequest.dayTicketShowCompanyName() == null || safeRequest.dayTicketShowCompanyName(),
                safeRequest.dayTicketShowCompanyAddress() == null || safeRequest.dayTicketShowCompanyAddress(),
                Boolean.TRUE.equals(safeRequest.serviceRecordShowCompanyName()),
                Boolean.TRUE.equals(safeRequest.serviceRecordShowCompanyAddress()),
                Boolean.TRUE.equals(safeRequest.invoiceShowCompanyName()),
                Boolean.TRUE.equals(safeRequest.invoiceShowCompanyAddress()),
                primaryColor,
                accentColor,
                provider,
                text(safeRequest.emailSenderName()),
                text(safeRequest.emailFromAddress()),
                text(safeRequest.emailReplyToAddress()),
                text(safeRequest.smtpHost()),
                smtpPort,
                text(safeRequest.smtpUsername()),
                safeRequest.smtpUseTls() == null || safeRequest.smtpUseTls(),
                Boolean.TRUE.equals(safeRequest.clearSmtpPassword()),
                text(safeRequest.smtpPassword()) != null,
                text(safeRequest.smtpPassword()),
                text(safeRequest.graphTenantId()),
                text(safeRequest.graphClientId()),
                text(safeRequest.graphSenderUser()),
                Boolean.TRUE.equals(safeRequest.clearGraphClientSecret()),
                text(safeRequest.graphClientSecret()) != null,
                text(safeRequest.graphClientSecret()),
                Boolean.TRUE.equals(safeRequest.autoSendWorkCompletedEmail()),
                Boolean.TRUE.equals(safeRequest.autoSendInvoiceEmail()),
                Boolean.TRUE.equals(safeRequest.liveWorkerTrackingEnabled()),
                actorUserId,
                tenantId
        );
        auditWriter.record(tenantId, actorUserId, "TENANT_SETTINGS_UPDATED", "TENANT", tenantId, Map.of(
                "organizationName", firstNonBlank(safeRequest.organizationName(), ""),
                "emailProvider", provider,
                "invoicePrefix", invoicePrefix,
                "invoiceTaxRate", invoiceTaxRate,
                "dayTicketShowCompanyName", safeRequest.dayTicketShowCompanyName() == null || safeRequest.dayTicketShowCompanyName(),
                "dayTicketShowCompanyAddress", safeRequest.dayTicketShowCompanyAddress() == null || safeRequest.dayTicketShowCompanyAddress(),
                "autoSendWorkCompletedEmail", Boolean.TRUE.equals(safeRequest.autoSendWorkCompletedEmail()),
                "autoSendInvoiceEmail", Boolean.TRUE.equals(safeRequest.autoSendInvoiceEmail()),
                "liveWorkerTrackingEnabled", Boolean.TRUE.equals(safeRequest.liveWorkerTrackingEnabled())
        ));
        return get(tenantId);
    }

    private TenantSettingsView mapView(ResultSet rs) throws SQLException {
        return new TenantSettingsView(
                rs.getString("tenant_name"),
                rs.getString("legal_name"),
                rs.getString("timezone"),
                firstNonBlank(rs.getString("country_code"), rs.getString("tenant_country_code")),
                rs.getString("organization_name"),
                rs.getString("billing_email"),
                rs.getString("support_email"),
                rs.getString("phone"),
                rs.getString("website_url"),
                rs.getString("address_line1"),
                rs.getString("address_line2"),
                rs.getString("city"),
                rs.getString("province_code"),
                rs.getString("postal_code"),
                rs.getString("invoice_prefix"),
                rs.getBigDecimal("invoice_tax_rate"),
                rs.getString("tax_registration_number"),
                rs.getString("invoice_footer"),
                rs.getString("payment_terms"),
                rs.getString("logo_url"),
                rs.getBoolean("day_ticket_show_company_name"),
                rs.getBoolean("day_ticket_show_company_address"),
                rs.getBoolean("service_record_show_company_name"),
                rs.getBoolean("service_record_show_company_address"),
                rs.getBoolean("invoice_show_company_name"),
                rs.getBoolean("invoice_show_company_address"),
                rs.getString("theme_primary_color"),
                rs.getString("theme_accent_color"),
                rs.getString("email_provider"),
                rs.getString("email_sender_name"),
                rs.getString("email_from_address"),
                rs.getString("email_reply_to_address"),
                rs.getString("smtp_host"),
                (Integer) rs.getObject("smtp_port"),
                rs.getString("smtp_username"),
                rs.getString("smtp_password"),
                rs.getBoolean("smtp_password_configured"),
                rs.getBoolean("smtp_use_tls"),
                rs.getString("graph_tenant_id"),
                rs.getString("graph_client_id"),
                rs.getString("graph_client_secret"),
                rs.getBoolean("graph_client_secret_configured"),
                rs.getString("graph_sender_user"),
                rs.getBoolean("auto_send_work_completed_email"),
                rs.getBoolean("auto_send_invoice_email"),
                rs.getBoolean("live_worker_tracking_enabled")
        );
    }

    private TenantSettingsDto toDto(TenantSettingsView settings) {
        return new TenantSettingsDto(
                settings.tenantName(),
                settings.legalName(),
                settings.timezone(),
                settings.countryCode(),
                settings.organizationName(),
                settings.billingEmail(),
                settings.supportEmail(),
                settings.phone(),
                settings.websiteUrl(),
                settings.addressLine1(),
                settings.addressLine2(),
                settings.city(),
                settings.provinceCode(),
                settings.postalCode(),
                settings.invoicePrefix(),
                settings.invoiceTaxRate(),
                settings.taxRegistrationNumber(),
                settings.invoiceFooter(),
                settings.paymentTerms(),
                settings.logoUrl(),
                settings.dayTicketShowCompanyName(),
                settings.dayTicketShowCompanyAddress(),
                settings.serviceRecordShowCompanyName(),
                settings.serviceRecordShowCompanyAddress(),
                settings.invoiceShowCompanyName(),
                settings.invoiceShowCompanyAddress(),
                settings.themePrimaryColor(),
                settings.themeAccentColor(),
                settings.emailProvider(),
                settings.emailSenderName(),
                settings.emailFromAddress(),
                settings.emailReplyToAddress(),
                settings.smtpHost(),
                settings.smtpPort(),
                settings.smtpUsername(),
                settings.smtpPasswordConfigured(),
                settings.smtpUseTls(),
                settings.graphTenantId(),
                settings.graphClientId(),
                settings.graphClientSecretConfigured(),
                settings.graphSenderUser(),
                settings.autoSendWorkCompletedEmail(),
                settings.autoSendInvoiceEmail(),
                settings.liveWorkerTrackingEnabled()
        );
    }

    private String provider(String value) {
        var normalized = firstNonBlank(value, "SYSTEM").toUpperCase(Locale.ROOT);
        if (!Set.of("SYSTEM", "TENANT_SMTP", "TENANT_GRAPH").contains(normalized)) {
            throw new BadRequestException("Email provider must be SYSTEM, TENANT_SMTP, or TENANT_GRAPH.");
        }
        return normalized;
    }

    private BigDecimal taxRate(BigDecimal value) {
        var rate = (value == null ? new BigDecimal("0.13") : value).setScale(4, RoundingMode.HALF_UP);
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.ONE) > 0) {
            throw new BadRequestException("Invoice tax rate must be between 0 and 1.");
        }
        return rate;
    }

    private String color(String value, String fallback, String error) {
        var normalized = firstNonBlank(value, fallback);
        if (!HEX_COLOR.matcher(normalized).matches()) {
            throw new BadRequestException(error);
        }
        return normalized;
    }

    private String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
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
