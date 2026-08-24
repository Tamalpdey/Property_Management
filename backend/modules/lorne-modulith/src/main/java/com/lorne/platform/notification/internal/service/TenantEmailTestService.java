package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.internal.dto.TestTenantEmailRequest;
import com.lorne.platform.notification.internal.dto.TestTenantEmailResponse;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantEmailTestService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final OutboundMailOperations outboundMailOperations;
    private final TenantSettingsOperations tenantSettingsOperations;

    public TenantEmailTestService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            OutboundMailOperations outboundMailOperations,
            TenantSettingsOperations tenantSettingsOperations
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.outboundMailOperations = outboundMailOperations;
        this.tenantSettingsOperations = tenantSettingsOperations;
    }

    @Transactional
    public TestTenantEmailResponse sendTest(UUID tenantId, UUID actorUserId, TestTenantEmailRequest request) {
        var safeRequest = request == null ? new TestTenantEmailRequest(null, null, null) : request;
        var recipient = text(safeRequest.recipientEmail());
        if (recipient == null) {
            throw new BadRequestException("Recipient email is required for the email test.");
        }

        var settings = tenantSettingsOperations.settings(tenantId);
        var tenantName = settings.invoiceBrandName();
        var subject = firstNonBlank(safeRequest.subject(), "Email test from " + tenantName);
        var body = firstNonBlank(safeRequest.body(), """
                This is a test email from %s.

                If you received this, outbound email is configured for this tenant.
                """.formatted(tenantName));

        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(recipient, subject, body, List.of()));
        var deliveryLogId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, recipient_email, subject, body, status, provider_message,
                    sent_at, delivery_mode, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                recipient,
                subject,
                body,
                delivery.status(),
                delivery.providerMessage(),
                delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                "TEST",
                actorUserId,
                actorUserId
        );

        auditWriter.record(tenantId, actorUserId, auditAction(delivery.status()), "TENANT", tenantId, Map.of(
                "recipientEmail", recipient,
                "status", delivery.status(),
                "provider", safe(delivery.provider()),
                "fromAddress", safe(delivery.fromAddress())
        ));
        return new TestTenantEmailResponse(deliveryLogId, delivery.status(), recipient, delivery.sentAt(), delivery.providerMessage());
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            var normalized = text(value);
            if (normalized != null) {
                return normalized;
            }
        }
        return "";
    }

    private String text(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private String auditAction(String status) {
            return "SENT".equalsIgnoreCase(status)
                ? "TENANT_EMAIL_TEST_SENT"
                : "TENANT_EMAIL_TEST_FAILED";
    }
}
