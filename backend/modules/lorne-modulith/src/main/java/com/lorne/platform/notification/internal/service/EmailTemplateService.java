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

            Owner ID: {{ownerCode}}
            Property ID: {{propertyCode}}
            Work order: {{workOrderNumber}}
            Service: {{workOrderTitle}}
            Amount due: {{invoiceTotal}}
            Due date: {{dueOn}}

            Thank you,
            {{tenantName}}
            """;
    private static final String DEFAULT_WORK_ORDER_COMPLETED_SUBJECT = "Work order {{workOrderNumber}} completed for {{propertyName}}";
    private static final String DEFAULT_WORK_ORDER_COMPLETED_BODY = """
            <div style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
              <div style="max-width:720px;margin:0 auto;padding:28px 18px;">
                <div style="border-top:6px solid {{tenantPrimaryColor}};border-radius:16px;background:#ffffff;box-shadow:0 10px 30px rgba(15,23,42,0.08);overflow:hidden;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:28px 30px 22px;border-bottom:1px solid #e2e8f0;">
                    <div>
                      <div style="margin-bottom:14px;">{{tenantLogoBlock}}</div>
                      <h1 style="margin:0;color:{{tenantPrimaryColor}};font-size:24px;line-height:1.2;">Work completed</h1>
                      <p style="margin:8px 0 0;color:#475569;font-size:14px;">{{tenantName}}</p>
                    </div>
                    <div style="text-align:right;font-size:13px;color:#475569;">
                      <strong style="display:block;color:#0f172a;font-size:15px;">{{workOrderNumber}}</strong>
                      <span>{{completedAt}}</span>
                    </div>
                  </div>
                  <div style="padding:24px 30px;">
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hello {{ownerName}},</p>
                    <p style="margin:0 0 22px;font-size:15px;line-height:1.6;">The work order for <strong>{{propertyName}}</strong> has been completed and reviewed by operations.</p>
                    <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 22px;font-size:14px;">
                      <tr>
                        <td style="width:50%;padding:12px;border:1px solid #e2e8f0;background:#f8fafc;"><strong>Owner ID</strong><br>{{ownerCode}}</td>
                        <td style="width:50%;padding:12px;border:1px solid #e2e8f0;background:#f8fafc;"><strong>Property ID</strong><br>{{propertyCode}}</td>
                      </tr>
                      <tr>
                        <td style="padding:12px;border:1px solid #e2e8f0;"><strong>Service</strong><br>{{serviceName}}</td>
                        <td style="padding:12px;border:1px solid #e2e8f0;"><strong>Address</strong><br>{{propertyAddress}}</td>
                      </tr>
                    </table>
                    <h2 style="margin:0 0 10px;color:{{tenantPrimaryColor}};font-size:16px;">Field completion</h2>
                    <div style="padding:16px;border:1px solid #dbe4ee;border-radius:12px;background:#ffffff;margin-bottom:18px;">{{fieldCompletionBlock}}</div>
                    <h2 style="margin:0 0 10px;color:{{tenantPrimaryColor}};font-size:16px;">Maintenance record</h2>
                    <div style="padding:16px;border:1px solid #dbe4ee;border-radius:12px;background:#ffffff;">{{maintenanceRecordBlock}}</div>
                    <p style="margin:18px 0 0;color:#475569;font-size:14px;line-height:1.6;">{{reviewNote}}</p>
                  </div>
                  <div style="padding:18px 30px;border-top:1px solid #e2e8f0;background:#f8fafc;color:#475569;font-size:13px;">
                    Thank you,<br><strong style="color:#0f172a;">{{tenantName}}</strong>
                  </div>
                </div>
              </div>
            </div>
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
    public EmailTemplateDto resetInvoiceTemplate(UUID tenantId, UUID actorUserId) {
        return resetTemplate(
                tenantId,
                actorUserId,
                INVOICE_OWNER_TEMPLATE_KEY,
                DEFAULT_INVOICE_SUBJECT,
                DEFAULT_INVOICE_BODY
        );
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

    @Transactional
    public EmailTemplateDto resetWorkOrderCompletedTemplate(UUID tenantId, UUID actorUserId) {
        return resetTemplate(
                tenantId,
                actorUserId,
                WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY,
                DEFAULT_WORK_ORDER_COMPLETED_SUBJECT,
                DEFAULT_WORK_ORDER_COMPLETED_BODY
        );
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

    private EmailTemplateDto resetTemplate(UUID tenantId, UUID actorUserId, String templateKey, String subject, String body) {
        ensureDefaultTemplate(tenantId, actorUserId, templateKey);
        jdbcTemplate.update("""
                UPDATE email_templates
                SET subject = ?, body = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND template_key = ?
                """, subject, body, actorUserId, tenantId, templateKey);
        var template = template(tenantId, templateKey);
        auditWriter.record(tenantId, actorUserId, "EMAIL_TEMPLATE_RESET", "EMAIL_TEMPLATE", template.id(), Map.of(
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
