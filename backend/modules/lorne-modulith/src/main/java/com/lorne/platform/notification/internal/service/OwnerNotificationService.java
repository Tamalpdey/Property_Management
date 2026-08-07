package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.NotificationDeliveryResult;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.notification.WorkOrderCompletionEmail;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OwnerNotificationService implements OwnerNotificationOperations {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final EmailTemplateOperations emailTemplateOperations;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final boolean mailEnabled;
    private final String fromAddress;

    public OwnerNotificationService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            EmailTemplateOperations emailTemplateOperations,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            @Value("${lorne.mail.enabled:false}") boolean mailEnabled,
            @Value("${lorne.mail.from:no-reply@lorne.local}") String fromAddress
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.emailTemplateOperations = emailTemplateOperations;
        this.mailSenderProvider = mailSenderProvider;
        this.mailEnabled = mailEnabled;
        this.fromAddress = fromAddress;
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
        var values = templateValues(email);
        var subject = emailTemplateOperations.render(template.subject(), values);
        var body = emailTemplateOperations.render(template.body(), values);
        var status = "RECORDED";
        var providerMessage = "SMTP disabled. Owner completion email recorded for review.";
        var sentAt = (Instant) null;

        if (mailEnabled) {
            try {
                var mailSender = mailSenderProvider.getIfAvailable();
                if (mailSender == null) {
                    throw new IllegalStateException("JavaMailSender is not available.");
                }
                var message = new SimpleMailMessage();
                message.setFrom(fromAddress);
                message.setTo(recipient);
                message.setSubject(subject);
                message.setText(body);
                mailSender.send(message);
                status = "SENT";
                providerMessage = "Sent by SMTP.";
                sentAt = Instant.now();
            } catch (RuntimeException exception) {
                status = "FAILED";
                providerMessage = exception.getMessage();
            }
        }

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
                status,
                providerMessage,
                sentAt == null ? null : Timestamp.from(sentAt),
                actorUserId,
                actorUserId
        );
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OWNER_NOTIFICATION_SENT", "WORK_ORDER", email.workOrderId(), Map.of(
                "workOrderNumber", safe(email.workOrderNumber()),
                "recipientEmail", recipient,
                "status", status,
                "mailEnabled", mailEnabled
        ));
        return new NotificationDeliveryResult(deliveryLogId, status, recipient, sentAt);
    }

    private Map<String, String> templateValues(WorkOrderCompletionEmail email) {
        var values = new LinkedHashMap<String, String>();
        values.put("workOrderNumber", email.workOrderNumber());
        values.put("ownerName", email.ownerName());
        values.put("propertyName", email.propertyName());
        values.put("propertyAddress", email.propertyAddress());
        values.put("workOrderTitle", email.title());
        values.put("serviceName", firstNonBlank(email.serviceName(), email.title()));
        values.put("completedAt", formatInstant(email.completedAt()));
        values.put("reviewNote", email.reviewNote() == null || email.reviewNote().isBlank() ? "" : "Review note: " + email.reviewNote());
        values.put("tenantName", "Lorne PropertyOps");
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
