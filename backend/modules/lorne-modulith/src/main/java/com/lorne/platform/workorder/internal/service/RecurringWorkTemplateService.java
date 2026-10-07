package com.lorne.platform.workorder.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.workorder.internal.dto.CreateRecurringWorkTemplateRequest;
import com.lorne.platform.workorder.internal.dto.RecurringWorkGenerationResult;
import com.lorne.platform.workorder.internal.dto.RecurringWorkTemplateDto;
import java.sql.Date;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecurringWorkTemplateService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final WorkOrderNumberGenerator workOrderNumberGenerator;

    public RecurringWorkTemplateService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            WorkOrderNumberGenerator workOrderNumberGenerator
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.workOrderNumberGenerator = workOrderNumberGenerator;
    }

    @Transactional(readOnly = true)
    public List<RecurringWorkTemplateDto> list(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT rwt.id, rwt.property_id, p.name AS property_name, c.display_name AS owner_name,
                       rwt.service_type_id, st.name AS service_name, rwt.title, rwt.description,
                       rwt.priority::text AS priority, rwt.recurrence_rule, rwt.recurrence_interval,
                       rwt.start_date, rwt.end_date, rwt.preferred_start_time, rwt.duration_minutes,
                       rwt.generate_days_ahead, rwt.last_generated_for, rwt.active
                FROM recurring_work_templates rwt
                JOIN properties p ON p.id = rwt.property_id AND p.tenant_id = rwt.tenant_id
                JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
                LEFT JOIN service_types st ON st.id = rwt.service_type_id AND st.tenant_id = rwt.tenant_id
                WHERE rwt.tenant_id = ?
                ORDER BY rwt.active DESC, rwt.start_date, rwt.title
                """, (rs, rowNum) -> new RecurringWorkTemplateDto(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getString("property_name"),
                rs.getString("owner_name"),
                rs.getObject("service_type_id", UUID.class),
                rs.getString("service_name"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("priority"),
                rs.getString("recurrence_rule"),
                rs.getInt("recurrence_interval"),
                rs.getObject("start_date", LocalDate.class),
                rs.getObject("end_date", LocalDate.class),
                rs.getObject("preferred_start_time", LocalTime.class),
                rs.getInt("duration_minutes"),
                rs.getInt("generate_days_ahead"),
                rs.getObject("last_generated_for", LocalDate.class),
                rs.getBoolean("active")
        ), tenantId);
    }

    @Transactional
    public RecurringWorkTemplateDto create(UUID tenantId, UUID actorUserId, CreateRecurringWorkTemplateRequest request) {
        requireProperty(tenantId, request.propertyId());
        requireServiceType(tenantId, request.serviceTypeId());
        var rule = recurrenceRule(request.recurrenceRule());
        var interval = positiveOrDefault(request.recurrenceInterval(), 1);
        var durationMinutes = positiveOrDefault(request.durationMinutes(), 60);
        var generateDaysAhead = positiveOrDefault(request.generateDaysAhead(), 7);
        if (request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new BadRequestException("Template end date must be after start date.");
        }
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO recurring_work_templates (
                    tenant_id, property_id, service_type_id, title, description, priority,
                    recurrence_rule, recurrence_interval, start_date, end_date, preferred_start_time,
                    duration_minutes, generate_days_ahead, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?::work_order_priority, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                request.propertyId(),
                request.serviceTypeId(),
                request.title().trim(),
                blankToNull(request.description()),
                priority(request.priority()),
                rule,
                interval,
                Date.valueOf(request.startDate()),
                request.endDate() == null ? null : Date.valueOf(request.endDate()),
                request.preferredStartTime() == null ? null : Time.valueOf(request.preferredStartTime()),
                durationMinutes,
                generateDaysAhead,
                actorUserId,
                actorUserId
        );
        auditWriter.record(tenantId, actorUserId, "RECURRING_WORK_TEMPLATE_CREATED", "RECURRING_WORK_TEMPLATE", id, Map.of(
                "title", request.title(),
                "propertyId", request.propertyId().toString(),
                "recurrenceRule", rule,
                "recurrenceInterval", interval
        ));
        return template(tenantId, id);
    }

    @Transactional
    public RecurringWorkGenerationResult generateDrafts(UUID tenantId, UUID actorUserId, LocalDate throughDate) {
        var through = throughDate == null ? LocalDate.now().plusDays(7) : throughDate;
        var templates = activeTemplates(tenantId);
        var drafts = new ArrayList<RecurringWorkGenerationResult.GeneratedDraftDto>();
        for (var template : templates) {
            var generationEnd = minDate(through, LocalDate.now().plusDays(template.generateDaysAhead()));
            var occurrences = occurrences(template, generationEnd);
            for (var occurrenceDate : occurrences) {
                createDraft(tenantId, actorUserId, template, occurrenceDate).ifPresent(draft -> {
                    drafts.add(draft);
                    auditRecurringDraftCreated(tenantId, actorUserId, draft);
                });
            }
            if (!occurrences.isEmpty()) {
                jdbcTemplate.update("""
                        UPDATE recurring_work_templates
                        SET last_generated_for = ?, updated_by = ?, updated_at = now()
                        WHERE tenant_id = ? AND id = ?
                        """, Date.valueOf(occurrences.getLast()), actorUserId, tenantId, template.id());
            }
        }
        auditWriter.record(tenantId, actorUserId, "RECURRING_WORK_DRAFTS_GENERATED", "RECURRING_WORK_TEMPLATE", null, Map.of(
                "generatedCount", drafts.size(),
                "throughDate", through.toString()
        ));
        return new RecurringWorkGenerationResult(drafts.size(), through, drafts);
    }

    private Optional<RecurringWorkGenerationResult.GeneratedDraftDto> createDraft(
            UUID tenantId,
            UUID actorUserId,
            RecurringWorkTemplateRecord template,
            LocalDate occurrenceDate
    ) {
        var ownerId = jdbcTemplate.queryForObject(
                "SELECT customer_id FROM properties WHERE tenant_id = ? AND id = ?",
                UUID.class,
                tenantId,
                template.propertyId()
        );
        var start = template.preferredStartTime() == null ? null : LocalDateTime.of(occurrenceDate, template.preferredStartTime());
        var end = start == null ? null : start.plusMinutes(template.durationMinutes());
        var scheduledStart = start == null ? null : Timestamp.valueOf(start);
        var scheduledEnd = end == null ? null : Timestamp.valueOf(end);
        var workOrderNumber = workOrderNumberGenerator.nextNumber(tenantId, LocalDate.now());
        var inserted = jdbcTemplate.query("""
                INSERT INTO work_orders (
                    tenant_id, work_order_number, customer_id, property_id, service_type_id, title, description, status, priority,
                    scheduled_start, scheduled_end, source, recurrence_rule, recurrence_interval, recurrence_until,
                    recurring_template_id, recurrence_occurrence_date, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?::work_order_priority, ?, ?, 'RECURRING', ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (tenant_id, recurring_template_id, recurrence_occurrence_date) WHERE recurring_template_id IS NOT NULL AND recurrence_occurrence_date IS NOT NULL
                DO NOTHING
                RETURNING id, work_order_number
                """,
                (rs, rowNum) -> new RecurringWorkGenerationResult.GeneratedDraftDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("work_order_number"),
                        template.id(),
                        template.title(),
                        template.propertyId(),
                        template.propertyName(),
                        template.serviceTypeId(),
                        template.serviceName(),
                        occurrenceDate,
                        instant(scheduledStart),
                        instant(scheduledEnd)
                ),
                tenantId,
                workOrderNumber,
                ownerId,
                template.propertyId(),
                template.serviceTypeId(),
                template.title(),
                template.description(),
                template.priority(),
                scheduledStart,
                scheduledEnd,
                template.recurrenceRule(),
                template.recurrenceInterval(),
                template.endDate() == null ? null : Date.valueOf(template.endDate()),
                template.id(),
                Date.valueOf(occurrenceDate),
                actorUserId,
                actorUserId
        );
        return inserted.stream().findFirst();
    }

    private void auditRecurringDraftCreated(
            UUID tenantId,
            UUID actorUserId,
            RecurringWorkGenerationResult.GeneratedDraftDto draft
    ) {
        var metadata = new java.util.LinkedHashMap<String, Object>();
        metadata.put("workOrderNumber", draft.workOrderNumber());
        metadata.put("templateId", draft.templateId().toString());
        metadata.put("title", draft.title());
        metadata.put("propertyId", draft.propertyId().toString());
        metadata.put("propertyName", draft.propertyName());
        metadata.put("serviceTypeId", draft.serviceTypeId() == null ? null : draft.serviceTypeId().toString());
        metadata.put("serviceName", draft.serviceName());
        metadata.put("occurrenceDate", draft.occurrenceDate().toString());
        metadata.put("scheduledStart", draft.scheduledStart() == null ? null : draft.scheduledStart().toString());
        metadata.put("scheduledEnd", draft.scheduledEnd() == null ? null : draft.scheduledEnd().toString());
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_RECURRING_DRAFT_CREATED", "WORK_ORDER", draft.workOrderId(), metadata);
    }

    private List<RecurringWorkTemplateRecord> activeTemplates(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT rwt.id, rwt.property_id, p.name AS property_name, rwt.service_type_id, st.name AS service_name,
                       rwt.title, rwt.description, rwt.priority::text AS priority,
                       recurrence_rule, recurrence_interval, start_date, end_date, preferred_start_time,
                       duration_minutes, generate_days_ahead, last_generated_for
                FROM recurring_work_templates rwt
                JOIN properties p ON p.id = rwt.property_id AND p.tenant_id = rwt.tenant_id
                LEFT JOIN service_types st ON st.id = rwt.service_type_id AND st.tenant_id = rwt.tenant_id
                WHERE rwt.tenant_id = ? AND rwt.active = true
                ORDER BY rwt.start_date, rwt.title
                """, (rs, rowNum) -> new RecurringWorkTemplateRecord(
                rs.getObject("id", UUID.class),
                rs.getObject("property_id", UUID.class),
                rs.getString("property_name"),
                rs.getObject("service_type_id", UUID.class),
                rs.getString("service_name"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("priority"),
                rs.getString("recurrence_rule"),
                rs.getInt("recurrence_interval"),
                rs.getObject("start_date", LocalDate.class),
                rs.getObject("end_date", LocalDate.class),
                rs.getObject("preferred_start_time", LocalTime.class),
                rs.getInt("duration_minutes"),
                rs.getInt("generate_days_ahead"),
                rs.getObject("last_generated_for", LocalDate.class)
        ), tenantId);
    }

    private Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private List<LocalDate> occurrences(RecurringWorkTemplateRecord template, LocalDate generationEnd) {
        var occurrences = new ArrayList<LocalDate>();
        var date = template.lastGeneratedFor() == null ? template.startDate() : nextOccurrence(template.lastGeneratedFor(), template);
        while (!date.isAfter(generationEnd)) {
            if (template.endDate() != null && date.isAfter(template.endDate())) {
                break;
            }
            if (!date.isBefore(LocalDate.now())) {
                occurrences.add(date);
            }
            date = nextOccurrence(date, template);
        }
        return occurrences;
    }

    private LocalDate nextOccurrence(LocalDate date, RecurringWorkTemplateRecord template) {
        return switch (template.recurrenceRule()) {
            case "DAILY" -> date.plusDays(template.recurrenceInterval());
            case "WEEKLY" -> date.plusWeeks(template.recurrenceInterval());
            case "MONTHLY" -> date.plusMonths(template.recurrenceInterval());
            default -> throw new BadRequestException("Unsupported recurrence rule.");
        };
    }

    private RecurringWorkTemplateDto template(UUID tenantId, UUID id) {
        return list(tenantId).stream()
                .filter(template -> template.id().equals(id))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Recurring work template not found."));
    }

    private void requireProperty(UUID tenantId, UUID propertyId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM properties WHERE tenant_id = ? AND id = ? AND active = true)",
                Boolean.class,
                tenantId,
                propertyId
        ));
        if (!exists) {
            throw new ResourceNotFoundException("Property not found.");
        }
    }

    private void requireServiceType(UUID tenantId, UUID serviceTypeId) {
        if (serviceTypeId == null) {
            return;
        }
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM service_types WHERE tenant_id = ? AND id = ? AND active = true)",
                Boolean.class,
                tenantId,
                serviceTypeId
        ));
        if (!exists) {
            throw new BadRequestException("Service is not available for this tenant.");
        }
    }

    private String recurrenceRule(String recurrenceRule) {
        var normalized = recurrenceRule == null ? "" : recurrenceRule.trim().toUpperCase();
        if (!List.of("DAILY", "WEEKLY", "MONTHLY").contains(normalized)) {
            throw new BadRequestException("Recurrence must be daily, weekly, or monthly.");
        }
        return normalized;
    }

    private String priority(String priority) {
        var normalized = priority == null || priority.isBlank() ? "NORMAL" : priority.trim().toUpperCase();
        if (!List.of("LOW", "NORMAL", "HIGH", "URGENT").contains(normalized)) {
            throw new BadRequestException("Priority is not valid.");
        }
        return normalized;
    }

    private int positiveOrDefault(Integer value, int fallback) {
        return value == null || value <= 0 ? fallback : value;
    }

    private LocalDate minDate(LocalDate left, LocalDate right) {
        return left.isBefore(right) ? left : right;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record RecurringWorkTemplateRecord(
            UUID id,
            UUID propertyId,
            String propertyName,
            UUID serviceTypeId,
            String serviceName,
            String title,
            String description,
            String priority,
            String recurrenceRule,
            int recurrenceInterval,
            LocalDate startDate,
            LocalDate endDate,
            LocalTime preferredStartTime,
            int durationMinutes,
            int generateDaysAhead,
            LocalDate lastGeneratedFor
    ) {
    }
}
