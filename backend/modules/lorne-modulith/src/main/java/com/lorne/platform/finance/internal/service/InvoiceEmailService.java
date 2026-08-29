package com.lorne.platform.finance.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.finance.internal.dto.InvoiceDto;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailResponse;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.EmailLogoRenderer;
import com.lorne.platform.notification.OutboundEmailAttachment;
import com.lorne.platform.notification.OutboundEmailInlineImage;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.tenant.TenantSettingsView;
import com.lorne.platform.shared.exception.BadRequestException;
import java.sql.Timestamp;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvoiceEmailService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final EmailTemplateOperations emailTemplateOperations;
    private final InvoicePdfService invoicePdfService;
    private final OutboundMailOperations outboundMailOperations;
    private final TenantSettingsOperations tenantSettingsOperations;
    private final EmailLogoRenderer emailLogoRenderer;

    public InvoiceEmailService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            EmailTemplateOperations emailTemplateOperations,
            InvoicePdfService invoicePdfService,
            OutboundMailOperations outboundMailOperations,
            TenantSettingsOperations tenantSettingsOperations,
            EmailLogoRenderer emailLogoRenderer
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.emailTemplateOperations = emailTemplateOperations;
        this.invoicePdfService = invoicePdfService;
        this.outboundMailOperations = outboundMailOperations;
        this.tenantSettingsOperations = tenantSettingsOperations;
        this.emailLogoRenderer = emailLogoRenderer;
    }

    @Transactional
    public SendInvoiceEmailResponse sendInvoice(UUID tenantId, UUID actorUserId, InvoiceDto invoice, SendInvoiceEmailRequest request) {
        var safeRequest = request == null ? new SendInvoiceEmailRequest(null, null, null, null, null, null, null) : request;
        var deliveryMode = deliveryMode(safeRequest.deliveryMode(), "SENT".equals(invoice.status()) ? "RESEND" : "MANUAL");
        var template = safeRequest.templateId() == null
                ? emailTemplateOperations.ensureDefaultInvoiceTemplate(tenantId, actorUserId)
                : emailTemplateOperations.template(tenantId, EmailTemplateOperations.INVOICE_OWNER_TEMPLATE_KEY);
        var recipient = firstNonBlank(safeRequest.recipientEmail(), invoice.ownerBillingEmail(), invoice.ownerEmail());
        if (recipient == null) {
            throw new BadRequestException("Owner billing email is required before sending an invoice.");
        }
        var settings = tenantSettingsOperations.settings(tenantId);
        var renderContext = templateValues(invoice, settings);
        var values = renderContext.values();
        var subject = emailTemplateOperations.render(firstNonBlank(safeRequest.subject(), template.subject()), values);
        var body = emailTemplateOperations.render(firstNonBlank(safeRequest.body(), template.body()), values);
        var ccRecipients = emailList(safeRequest.ccEmails());
        var bccRecipients = emailList(safeRequest.bccEmails());
        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(
                recipient,
                subject,
                body,
                List.of(new OutboundEmailAttachment(safeFilename(invoice.invoiceNumber()) + ".pdf", invoicePdfService.generate(invoice, tenantId, settings), "application/pdf")),
                ccRecipients,
                bccRecipients,
                renderContext.inlineImages()
        ));

        var deliveryLogId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, template_id, invoice_id, customer_id, recipient_email,
                    cc_emails, bcc_emails, subject, body, status, provider_message, sent_at, delivery_mode, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                template.id(),
                invoice.id(),
                invoice.customerId(),
                recipient,
                joinedEmails(ccRecipients),
                joinedEmails(bccRecipients),
                subject,
                body,
                delivery.status(),
                delivery.providerMessage(),
                delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                deliveryMode,
                actorUserId,
                actorUserId
        );
        if ("SENT".equals(delivery.status())) {
            jdbcTemplate.update("""
                    UPDATE invoices
                    SET status = 'SENT'::invoice_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ? AND status = 'DRAFT'
                    """, actorUserId, tenantId, invoice.id());
        }
        auditWriter.record(tenantId, actorUserId, "INVOICE_EMAIL_SENT", "INVOICE", invoice.id(), Map.of(
                "invoiceNumber", invoice.invoiceNumber(),
                "recipientEmail", recipient,
                "ccEmails", joinedEmails(ccRecipients) == null ? "" : joinedEmails(ccRecipients),
                "bccEmails", joinedEmails(bccRecipients) == null ? "" : joinedEmails(bccRecipients),
                "status", delivery.status(),
                "deliveryMode", deliveryMode,
                "provider", delivery.provider(),
                "fromAddress", delivery.fromAddress()
        ));
        return new SendInvoiceEmailResponse(deliveryLogId, delivery.status(), recipient, delivery.sentAt());
    }

    private EmailRenderContext templateValues(InvoiceDto invoice, TenantSettingsView settings) {
        var tenantName = settings.invoiceBrandName();
        var primaryColor = firstNonBlank(settings.themePrimaryColor(), "#0f766e");
        var accentColor = firstNonBlank(settings.themeAccentColor(), "#2563eb");
        var logo = emailLogoRenderer.render(settings.logoUrl(), tenantName, primaryColor);
        var values = new LinkedHashMap<String, String>();
        values.put("invoiceNumber", invoice.invoiceNumber());
        values.put("ownerCode", invoice.ownerCode());
        values.put("ownerName", invoice.ownerName());
        values.put("propertyCode", invoice.propertyCode());
        values.put("propertyName", invoice.propertyName());
        values.put("propertyAddress", invoice.propertyAddress());
        values.put("workOrderNumber", invoice.workOrderNumber());
        values.put("workOrderTitle", invoice.workOrderTitle());
        values.put("invoiceSubtotal", money(invoice.subtotal()));
        values.put("invoiceTax", money(invoice.taxTotal()));
        values.put("invoiceTotal", money(invoice.total()));
        values.put("issuedOn", invoice.issuedOn() == null ? "" : invoice.issuedOn().toString());
        values.put("dueOn", invoice.dueOn() == null ? "" : invoice.dueOn().toString());
        values.put("tenantName", tenantName);
        values.put("tenantPrimaryColor", primaryColor);
        values.put("tenantAccentColor", accentColor);
        values.put("tenantLogoUrl", logo.publicUrl());
        values.put("tenantLogoBlock", logo.htmlBlock());
        return new EmailRenderContext(values, logo.inlineImages());
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private String money(java.math.BigDecimal value) {
        return value == null ? "$0.00" : "$" + value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String safeFilename(String value) {
        return value == null ? "invoice" : value.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private List<String> emailList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return java.util.Arrays.stream(value.split("[,;\\s]+"))
                .map(String::trim)
                .filter(email -> !email.isBlank())
                .distinct()
                .toList();
    }

    private String joinedEmails(List<String> values) {
        return values == null || values.isEmpty() ? null : String.join(", ", values);
    }

    private String deliveryMode(String value, String fallback) {
        var normalized = firstNonBlank(value, fallback);
        return switch (normalized.toUpperCase(java.util.Locale.ROOT)) {
            case "AUTO", "MANUAL", "RESEND", "TEST" -> normalized.toUpperCase(java.util.Locale.ROOT);
            default -> fallback;
        };
    }

    private record EmailRenderContext(
            Map<String, String> values,
            List<OutboundEmailInlineImage> inlineImages
    ) {
    }
}
