package com.lorne.platform.notification.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.EmailTemplateView;
import com.lorne.platform.notification.internal.dto.EmailTemplateDto;
import com.lorne.platform.notification.internal.dto.UpdateEmailTemplateRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EmailTemplateService implements EmailTemplateOperations {
    private static final String DEFAULT_INVOICE_SUBJECT = "Invoice {{invoiceNumber}} for {{propertyName}}";
    private static final String DEFAULT_INVOICE_BODY = """
            Hello {{ownerName}},

            Please find invoice {{invoiceNumber}} for {{propertyName}}.

            Work order: {{workOrderNumber}}
            Service: {{workOrderTitle}}
            Amount due: {{invoiceTotal}}
            Due date: {{dueOn}}

            Thank you,
            {{tenantName}}
            """;
    private static final String DEFAULT_WORK_ORDER_COMPLETED_SUBJECT = "Work order {{workOrderNumber}} completed for {{propertyName}}";
    private static final String DEFAULT_WORK_ORDER_COMPLETED_BODY = """
            Hello {{ownerName}},

            Work order {{workOrderNumber}} for {{propertyName}} has been completed and reviewed by operations.

            Service: {{serviceName}}
            Work order title: {{workOrderTitle}}
            Completed: {{completedAt}}

            {{reviewNote}}

            Thank you,
            {{tenantName}}
            """;

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public EmailTemplateService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional
    public EmailTemplateDto invoiceTemplate(UUID tenantId, UUID actorUserId) {
        ensureDefaultInvoiceTemplate(tenantId, actorUserId);
        return toDto(template(tenantId, INVOICE_OWNER_TEMPLATE_KEY));
    }

    @Transactional
    public EmailTemplateDto updateInvoiceTemplate(UUID tenantId, UUID actorUserId, UpdateEmailTemplateRequest request) {
        return updateTemplate(tenantId, actorUserId, INVOICE_OWNER_TEMPLATE_KEY, request);
    }

    @Transactional
    public EmailTemplateDto workOrderCompletedTemplate(UUID tenantId, UUID actorUserId) {
        ensureDefaultWorkOrderCompletedTemplate(tenantId, actorUserId);
        return toDto(template(tenantId, WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY));
    }

    @Transactional
    public EmailTemplateDto updateWorkOrderCompletedTemplate(UUID tenantId, UUID actorUserId, UpdateEmailTemplateRequest request) {
        return updateTemplate(tenantId, actorUserId, WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY, request);
    }

    private EmailTemplateDto updateTemplate(UUID tenantId, UUID actorUserId, String templateKey, UpdateEmailTemplateRequest request) {
        var subject = blankToNull(request.subject());
        var body = blankToNull(request.body());
        if (subject == null) {
            throw new BadRequestException("Template subject is required.");
        }
        if (body == null) {
            throw new BadRequestException("Template body is required.");
        }
        ensureDefaultTemplate(tenantId, actorUserId, templateKey);
        jdbcTemplate.update("""
                UPDATE email_templates
                SET subject = ?, body = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND template_key = ?
                """, subject, body, actorUserId, tenantId, templateKey);
        var template = template(tenantId, templateKey);
        auditWriter.record(tenantId, actorUserId, "EMAIL_TEMPLATE_UPDATED", "EMAIL_TEMPLATE", template.id(), Map.of(
                "templateKey", template.templateKey(),
                "name", template.name()
        ));
        return toDto(template);
    }

    private EmailTemplateView ensureDefaultTemplate(UUID tenantId, UUID actorUserId, String templateKey) {
        return switch (templateKey) {
            case INVOICE_OWNER_TEMPLATE_KEY -> ensureDefaultInvoiceTemplate(tenantId, actorUserId);
            case WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY -> ensureDefaultWorkOrderCompletedTemplate(tenantId, actorUserId);
            default -> throw new BadRequestException("Unsupported email template.");
        };
    }

    @Transactional
    @Override
    public EmailTemplateView ensureDefaultInvoiceTemplate(UUID tenantId, UUID actorUserId) {
        return ensureDefaultTemplate(
                tenantId,
                actorUserId,
                INVOICE_OWNER_TEMPLATE_KEY,
                "Owner invoice email",
                DEFAULT_INVOICE_SUBJECT,
                DEFAULT_INVOICE_BODY
        );
    }

    @Transactional
    @Override
    public EmailTemplateView ensureDefaultWorkOrderCompletedTemplate(UUID tenantId, UUID actorUserId) {
        return ensureDefaultTemplate(
                tenantId,
                actorUserId,
                WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY,
                "Owner work completed email",
                DEFAULT_WORK_ORDER_COMPLETED_SUBJECT,
                DEFAULT_WORK_ORDER_COMPLETED_BODY
        );
    }

    private EmailTemplateView ensureDefaultTemplate(
            UUID tenantId,
            UUID actorUserId,
            String templateKey,
            String name,
            String subject,
            String body
    ) {
        jdbcTemplate.update("""
                INSERT INTO email_templates (tenant_id, template_key, name, subject, body, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (tenant_id, template_key) DO NOTHING
                """, tenantId, templateKey, name, subject, body, actorUserId, actorUserId);
        return template(tenantId, templateKey);
    }

    @Transactional(readOnly = true)
    @Override
    public EmailTemplateView template(UUID tenantId, String templateKey) {
        return jdbcTemplate.query("""
                SELECT id, template_key, name, subject, body, active, updated_at
                FROM email_templates
                WHERE tenant_id = ? AND template_key = ?
                """, rs -> {
            if (!rs.next()) {
                throw new BadRequestException("Email template is not configured.");
            }
            return mapTemplate(rs);
        }, tenantId, templateKey);
    }

    private EmailTemplateView mapTemplate(ResultSet rs) throws SQLException {
        return new EmailTemplateView(
                rs.getObject("id", UUID.class),
                rs.getString("template_key"),
                rs.getString("name"),
                rs.getString("subject"),
                rs.getString("body"),
                rs.getBoolean("active"),
                instant("updated_at", rs)
        );
    }

    private EmailTemplateDto toDto(EmailTemplateView template) {
        return new EmailTemplateDto(
                template.id(),
                template.templateKey(),
                template.name(),
                template.subject(),
                template.body(),
                template.active(),
                template.updatedAt()
        );
    }

    private Instant instant(String column, ResultSet rs) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
