package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.NotificationDeliveryResult;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.notification.WorkOrderCompletionEmail;
import com.lorne.platform.tenant.TenantSettingsOperations;
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

    public OwnerNotificationService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            EmailTemplateOperations emailTemplateOperations,
            OutboundMailOperations outboundMailOperations,
            TenantSettingsOperations tenantSettingsOperations
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.emailTemplateOperations = emailTemplateOperations;
        this.outboundMailOperations = outboundMailOperations;
        this.tenantSettingsOperations = tenantSettingsOperations;
    }

    @Transactional
    @Override
    public NotificationDeliveryResult sendWorkOrderCompleted(UUID tenantId, UUID actorUserId, WorkOrderCompletionEmail email) {
        var recipient = firstNonBlank(email.ownerBillingEmail(), email.ownerEmail());
        if (recipient == null) {
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OWNER_NOTIFICATION_FAILED", "WORK_ORDER", email.workOrderId(), Map.of(
                    "workOrderNumber", safe(email.workOrderNumber()),
                    "ownerName", safe(email.ownerName()),
                    "reason", "Owner email is missing."
            ));
            return new NotificationDeliveryResult(null, "FAILED", "", null);
        }

        var template = emailTemplateOperations.ensureDefaultWorkOrderCompletedTemplate(tenantId, actorUserId);
        var values = templateValues(email, tenantSettingsOperations.settings(tenantId).invoiceBrandName());
        var subject = emailTemplateOperations.render(template.subject(), values);
        var body = emailTemplateOperations.render(template.body(), values);
        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(recipient, subject, body, List.of()));

        var deliveryLogId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, template_id, work_order_id, customer_id, recipient_email,
                    subject, body, status, provider_message, sent_at, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                template.id(),
                email.workOrderId(),
                email.customerId(),
                recipient,
                subject,
                body,
                delivery.status(),
                delivery.providerMessage(),
                delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                actorUserId,
                actorUserId
        );
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OWNER_NOTIFICATION_SENT", "WORK_ORDER", email.workOrderId(), Map.of(
                "workOrderNumber", safe(email.workOrderNumber()),
                "recipientEmail", recipient,
                "status", delivery.status(),
                "provider", delivery.provider(),
                "fromAddress", delivery.fromAddress()
        ));
        return new NotificationDeliveryResult(deliveryLogId, delivery.status(), recipient, delivery.sentAt());
    }

    private Map<String, String> templateValues(WorkOrderCompletionEmail email, String tenantName) {
        var values = new LinkedHashMap<String, String>();
        values.put("workOrderNumber", email.workOrderNumber());
        values.put("ownerName", email.ownerName());
        values.put("propertyName", email.propertyName());
        values.put("propertyAddress", email.propertyAddress());
        values.put("workOrderTitle", email.title());
        values.put("serviceName", firstNonBlank(email.serviceName(), email.title()));
        values.put("completedAt", formatInstant(email.completedAt()));
        values.put("reviewNote", email.reviewNote() == null || email.reviewNote().isBlank() ? "" : "Review note: " + email.reviewNote());
        values.put("tenantName", tenantName);
        return values;
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
}
