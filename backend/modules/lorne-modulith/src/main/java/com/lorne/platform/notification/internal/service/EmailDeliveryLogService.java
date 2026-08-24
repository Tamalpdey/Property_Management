package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.internal.dto.EmailDeliveryLogDto;
import com.lorne.platform.notification.internal.dto.ResendEmailDeliveryRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailDeliveryLogService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final OutboundMailOperations outboundMailOperations;

    public EmailDeliveryLogService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            OutboundMailOperations outboundMailOperations
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.outboundMailOperations = outboundMailOperations;
    }

    @Transactional(readOnly = true)
    public List<EmailDeliveryLogDto> list(UUID tenantId, Integer requestedLimit) {
        var limit = requestedLimit == null ? 50 : Math.max(1, Math.min(requestedLimit, 100));
        return jdbcTemplate.query("""
                SELECT edl.id,
                       CASE
                         WHEN edl.invoice_id IS NOT NULL THEN 'INVOICE_EMAIL'
                         WHEN edl.work_order_id IS NOT NULL THEN 'WORK_ORDER_COMPLETION'
                         WHEN edl.template_id IS NOT NULL THEN 'TEST_EMAIL'
                         ELSE 'OWNER_EMAIL'
                       END AS communication_type,
                       edl.delivery_mode,
                       edl.invoice_id,
                       i.invoice_number,
                       coalesce(edl.work_order_id, i.work_order_id) AS work_order_id,
                       wo.work_order_number,
                       c.display_name AS owner_name,
                       edl.recipient_email,
                       edl.cc_emails,
                       edl.bcc_emails,
                       edl.subject,
                       edl.body,
                       edl.status,
                       edl.provider_message,
                       edl.sent_at,
                       edl.created_at
                FROM email_delivery_logs edl
                LEFT JOIN invoices i ON i.id = edl.invoice_id AND i.tenant_id = edl.tenant_id
                LEFT JOIN work_orders wo ON wo.id = coalesce(edl.work_order_id, i.work_order_id) AND wo.tenant_id = edl.tenant_id
                LEFT JOIN customers c ON c.id = coalesce(edl.customer_id, i.customer_id, wo.customer_id) AND c.tenant_id = edl.tenant_id
                WHERE edl.tenant_id = ?
                ORDER BY edl.created_at DESC
                LIMIT ?
                """, (rs, rowNum) -> new EmailDeliveryLogDto(
                rs.getObject("id", UUID.class),
                rs.getString("communication_type"),
                rs.getString("delivery_mode"),
                rs.getObject("invoice_id", UUID.class),
                rs.getString("invoice_number"),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("owner_name"),
                rs.getString("recipient_email"),
                rs.getString("cc_emails"),
                rs.getString("bcc_emails"),
                rs.getString("subject"),
                rs.getString("body"),
                rs.getString("status"),
                rs.getString("provider_message"),
                instant(rs.getTimestamp("sent_at")),
                instant(rs.getTimestamp("created_at"))
        ), tenantId, limit);
    }

    @Transactional
    public EmailDeliveryLogDto resend(UUID tenantId, UUID actorUserId, UUID deliveryLogId, ResendEmailDeliveryRequest request) {
        var source = load(tenantId, deliveryLogId);
        var recipient = firstNonBlank(request == null ? null : request.recipientEmail(), source.recipientEmail());
        if (recipient == null) {
            throw new BadRequestException("Recipient email is required.");
        }
        var ccRecipients = emailList(request == null ? source.ccEmails() : request.ccEmails());
        var bccRecipients = emailList(request == null ? source.bccEmails() : request.bccEmails());
        var ccEmails = joinedEmails(ccRecipients);
        var bccEmails = joinedEmails(bccRecipients);
        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(
                recipient,
                source.subject(),
                source.body(),
                List.of(),
                ccRecipients,
                bccRecipients
        ));
        var resentId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, template_id, invoice_id, work_order_id, customer_id, recipient_email,
                    cc_emails, bcc_emails, subject, body, status, provider_message, sent_at, delivery_mode, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RESEND', ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                source.templateId(),
                source.invoiceId(),
                source.workOrderId(),
                source.customerId(),
                recipient,
                ccEmails,
                bccEmails,
                source.subject(),
                source.body(),
                delivery.status(),
                delivery.providerMessage(),
                delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                actorUserId,
                actorUserId
        );
        auditWriter.record(tenantId, actorUserId, "EMAIL_DELIVERY_RESENT", "EMAIL_DELIVERY", resentId, Map.of(
                "sourceDeliveryLogId", deliveryLogId.toString(),
                "recipientEmail", recipient,
                "ccEmails", safe(ccEmails),
                "bccEmails", safe(bccEmails),
                "status", delivery.status(),
                "provider", delivery.provider()
        ));
        return list(tenantId, 100).stream()
                .filter(log -> resentId.equals(log.id()))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Resent email delivery not found."));
    }

    private EmailLogRow load(UUID tenantId, UUID deliveryLogId) {
        var rows = jdbcTemplate.query("""
                SELECT id, template_id, invoice_id, work_order_id, customer_id, recipient_email,
                       cc_emails, bcc_emails, subject, body
                FROM email_delivery_logs
                WHERE tenant_id = ? AND id = ?
                """, (rs, rowNum) -> new EmailLogRow(
                rs.getObject("id", UUID.class),
                rs.getObject("template_id", UUID.class),
                rs.getObject("invoice_id", UUID.class),
                rs.getObject("work_order_id", UUID.class),
                rs.getObject("customer_id", UUID.class),
                rs.getString("recipient_email"),
                rs.getString("cc_emails"),
                rs.getString("bcc_emails"),
                rs.getString("subject"),
                rs.getString("body")
        ), tenantId, deliveryLogId);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Email delivery log not found.");
        }
        return rows.getFirst();
    }

    private Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private List<String> emailList(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split("[,;\\s]+"))
                .map(String::trim)
                .filter(email -> !email.isBlank())
                .distinct()
                .toList();
    }

    private String joinedEmails(List<String> values) {
        return values == null || values.isEmpty() ? null : String.join(", ", values);
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

    private record EmailLogRow(
            UUID id,
            UUID templateId,
            UUID invoiceId,
            UUID workOrderId,
            UUID customerId,
            String recipientEmail,
            String ccEmails,
            String bccEmails,
            String subject,
            String body
    ) {
    }
}
