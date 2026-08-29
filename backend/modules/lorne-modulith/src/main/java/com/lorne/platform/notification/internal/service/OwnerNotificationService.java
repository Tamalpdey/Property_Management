package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.EmailLogoRenderer;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.NotificationDeliveryResult;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundEmailInlineImage;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.notification.WorkOrderCompletionEmail;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.tenant.TenantSettingsView;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.sql.Timestamp;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OwnerNotificationService implements OwnerNotificationOperations {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final EmailTemplateOperations emailTemplateOperations;
    private final OutboundMailOperations outboundMailOperations;
    private final TenantSettingsOperations tenantSettingsOperations;
    private final EmailLogoRenderer emailLogoRenderer;

    public OwnerNotificationService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            EmailTemplateOperations emailTemplateOperations,
            OutboundMailOperations outboundMailOperations,
            TenantSettingsOperations tenantSettingsOperations,
            EmailLogoRenderer emailLogoRenderer
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.emailTemplateOperations = emailTemplateOperations;
        this.outboundMailOperations = outboundMailOperations;
        this.tenantSettingsOperations = tenantSettingsOperations;
        this.emailLogoRenderer = emailLogoRenderer;
    }

    @Transactional
    @Override
    public NotificationDeliveryResult sendWorkOrderCompleted(UUID tenantId, UUID actorUserId, WorkOrderCompletionEmail email) {
        var recipient = firstNonBlank(email.recipientEmailOverride(), email.ownerBillingEmail(), email.ownerEmail());
        var deliveryMode = deliveryMode(email.deliveryMode(), "MANUAL");
        if (recipient == null) {
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OWNER_NOTIFICATION_FAILED", "WORK_ORDER", email.workOrderId(), Map.of(
                    "workOrderNumber", safe(email.workOrderNumber()),
                    "ownerName", safe(email.ownerName()),
                    "reason", "Owner email is missing."
            ));
            return new NotificationDeliveryResult(null, "FAILED", "", null);
        }

        var settings = tenantSettingsOperations.settings(tenantId);
        var template = emailTemplateOperations.ensureDefaultWorkOrderCompletedTemplate(tenantId, actorUserId);
        var renderContext = templateValues(email, settings);
        var values = renderContext.values();
        var subject = emailTemplateOperations.render(template.subject(), values);
        var body = completionBody(template.body(), emailTemplateOperations.render(template.body(), values), values);
        var ccRecipients = emailList(email.ccEmails());
        var bccRecipients = emailList(email.bccEmails());
        var ccEmails = joinedEmails(ccRecipients);
        var bccEmails = joinedEmails(bccRecipients);
        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(
                recipient,
                subject,
                body,
                List.of(),
                ccRecipients,
                bccRecipients,
                renderContext.inlineImages()
        ));

        var deliveryLogId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, template_id, work_order_id, customer_id, recipient_email,
                    cc_emails, bcc_emails, subject, body, status, provider_message, sent_at, delivery_mode, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                template.id(),
                email.workOrderId(),
                email.customerId(),
                recipient,
                ccEmails,
                bccEmails,
                subject,
                body,
                delivery.status(),
                delivery.providerMessage(),
                delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                deliveryMode,
                actorUserId,
                actorUserId
        );
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OWNER_NOTIFICATION_SENT", "WORK_ORDER", email.workOrderId(), Map.of(
                "workOrderNumber", safe(email.workOrderNumber()),
                "recipientEmail", recipient,
                "ccEmails", safe(ccEmails),
                "bccEmails", safe(bccEmails),
                "status", delivery.status(),
                "deliveryMode", deliveryMode,
                "provider", delivery.provider(),
                "fromAddress", delivery.fromAddress()
        ));
        return new NotificationDeliveryResult(deliveryLogId, delivery.status(), recipient, delivery.sentAt());
    }

    private EmailRenderContext templateValues(WorkOrderCompletionEmail email, TenantSettingsView settings) {
        var tenantName = settings.invoiceBrandName();
        var primaryColor = firstNonBlank(settings.themePrimaryColor(), "#0f766e");
        var accentColor = firstNonBlank(settings.themeAccentColor(), "#2563eb");
        var logo = emailLogoRenderer.render(settings.logoUrl(), tenantName, primaryColor);
        var values = new LinkedHashMap<String, String>();
        values.put("workOrderNumber", safe(email.workOrderNumber()));
        values.put("ownerCode", safe(email.ownerCode()));
        values.put("ownerName", safe(email.ownerName()));
        values.put("propertyCode", safe(email.propertyCode()));
        values.put("propertyName", safe(email.propertyName()));
        values.put("propertyAddress", safe(email.propertyAddress()));
        values.put("workOrderTitle", safe(email.title()));
        values.put("serviceName", firstNonBlank(email.serviceName(), email.title(), ""));
        values.put("completedAt", formatInstant(email.completedAt()));
        values.put("reviewNote", email.reviewNote() == null || email.reviewNote().isBlank() ? "" : "Review note: " + email.reviewNote());
        values.put("tenantName", tenantName);
        values.put("tenantPrimaryColor", primaryColor);
        values.put("tenantAccentColor", accentColor);
        values.put("tenantLogoUrl", logo.publicUrl());
        values.put("tenantLogoBlock", logo.htmlBlock());
        values.put("onSiteWorkers", safe(email.onSiteWorkers()));
        values.put("arrivedOnSiteAt", formatInstant(email.arrivedOnSiteAt()));
        values.put("workCompletedAt", formatInstant(email.workCompletedAt()));
        values.put("serviceDetails", safe(email.serviceDetails()));
        values.put("deliveriesSummary", safe(email.deliveriesSummary()));
        values.put("fieldCompletionBlock", fieldCompletionBlock(email));
        values.put("maintenanceRecordSummary", safe(email.maintenanceRecordSummary()));
        values.put("maintenanceClientNote", safe(email.maintenanceClientNote()));
        values.put("maintenanceRecordBlock", maintenanceRecordBlock(email));
        return new EmailRenderContext(values, logo.inlineImages());
    }

    private String completionBody(String templateBody, String renderedBody, Map<String, String> values) {
        if (templateBody.contains("{{fieldCompletionBlock}}") || templateBody.contains("{{maintenanceRecordBlock}}")) {
            return renderedBody;
        }
        return renderedBody + """

                <div style="margin:24px 0 0;padding:18px;border:1px solid #dbe4ee;border-radius:14px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
                  <h2 style="margin:0 0 10px;color:%s;font-size:16px;">Field completion</h2>
                  <div style="margin-bottom:18px;">%s</div>
                  <h2 style="margin:0 0 10px;color:%s;font-size:16px;">Maintenance record</h2>
                  <div>%s</div>
                </div>
                """.formatted(
                escapeHtml(values.get("tenantPrimaryColor")),
                values.get("fieldCompletionBlock"),
                escapeHtml(values.get("tenantPrimaryColor")),
                values.get("maintenanceRecordBlock")
        );
    }

    private String fieldCompletionBlock(WorkOrderCompletionEmail email) {
        var rows = new StringBuilder();
        addFieldCompletionRow(rows, "Workers on site", email.onSiteWorkers(), "No assigned worker was captured.");
        addFieldCompletionRow(rows, "Reached site", formatInstant(email.arrivedOnSiteAt()), "Not captured.");
        addFieldCompletionRow(rows, "Worker marked work complete", formatInstant(email.workCompletedAt()), "Not captured.");
        addFieldCompletionRow(rows, "Operations approved", formatInstant(email.completedAt()), "Not captured.");
        return "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;font-size:14px;\">" + rows + "</table>";
    }

    private void addFieldCompletionRow(StringBuilder rows, String label, String value) {
        addFieldCompletionRow(rows, label, value, null);
    }

    private void addFieldCompletionRow(StringBuilder rows, String label, String value, String missingText) {
        var text = safe(firstNonBlank(value, ""));
        if (text.isBlank()) {
            if (missingText == null || missingText.isBlank()) {
                return;
            }
            text = missingText;
        }
        var missing = missingText != null && text.equals(missingText);
        rows.append("<tr>")
                .append("<td style=\"width:34%;vertical-align:top;padding:10px;border:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-weight:700;\">")
                .append(escapeHtml(label))
                .append("</td>")
                .append("<td style=\"vertical-align:top;padding:10px;border:1px solid #e2e8f0;color:")
                .append(missing ? "#92400e" : "#0f172a")
                .append(";background:")
                .append(missing ? "#fffbeb" : "#ffffff")
                .append(";white-space:pre-wrap;\">")
                .append(escapeHtml(text))
                .append("</td>")
                .append("</tr>");
    }

    private String maintenanceRecordBlock(WorkOrderCompletionEmail email) {
        var summary = safe(firstNonBlank(email.maintenanceRecordSummary(), ""));
        var clientNote = safe(firstNonBlank(email.maintenanceClientNote(), ""));
        var serviceDetails = safe(firstNonBlank(email.serviceDetails(), ""));
        var deliveries = safe(firstNonBlank(email.deliveriesSummary(), ""));
        if (summary.isBlank() && clientNote.isBlank() && serviceDetails.isBlank() && deliveries.isBlank()) {
            return "<p style=\"margin:0;color:#64748b;\">No maintenance record details were captured.</p>";
        }
        var builder = new StringBuilder();
        if (!serviceDetails.isBlank()) {
            builder.append("<strong style=\"display:block;margin-bottom:6px;color:#0f766e;\">Service details</strong>")
                    .append("<pre style=\"white-space:pre-wrap;margin:0 0 14px;font-family:inherit;font-size:14px;line-height:1.55;color:#0f172a;\">")
                    .append(escapeHtml(serviceDetails))
                    .append("</pre>");
        }
        if (!deliveries.isBlank()) {
            builder.append("<strong style=\"display:block;margin-bottom:6px;color:#0f766e;\">Deliveries</strong>")
                    .append("<pre style=\"white-space:pre-wrap;margin:0 0 14px;font-family:inherit;font-size:14px;line-height:1.55;color:#0f172a;\">")
                    .append(escapeHtml(deliveries))
                    .append("</pre>");
        }
        if (!summary.isBlank()) {
            builder.append("<strong style=\"display:block;margin-bottom:6px;color:#0f766e;\">Worker note</strong>");
            builder.append("<pre style=\"white-space:pre-wrap;margin:0;font-family:inherit;font-size:14px;line-height:1.55;color:#0f172a;\">")
                    .append(escapeHtml(summary))
                    .append("</pre>");
        }
        if (!clientNote.isBlank()) {
            builder.append("<div style=\"margin-top:14px;padding:12px 14px;border-left:4px solid #0f766e;background:#f0fdfa;border-radius:8px;\">")
                    .append("<strong style=\"display:block;margin-bottom:4px;color:#0f766e;\">Client - Please Note</strong>")
                    .append("<span style=\"white-space:pre-wrap;color:#0f172a;\">")
                    .append(escapeHtml(clientNote))
                    .append("</span></div>");
        }
        return builder.toString();
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

    private String formatInstant(Instant value) {
        if (value == null) {
            return "";
        }
        return DateTimeFormatter.ofPattern("MMM d, yyyy h:mm a").withZone(ZoneId.systemDefault()).format(value);
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String safe(String value) {
        return value == null ? "" : value;
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
