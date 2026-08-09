package com.lorne.platform.workorder.internal.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.notification.WorkOrderCompletionEmail;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.workorder.internal.dto.CancelWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.SendWorkOrderOwnerEmailRequest;
import com.lorne.platform.workorder.internal.dto.WorkerAvailabilityDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewActionRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewDto;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkOrderManagementService {
    private static final TypeReference<Map<String, Object>> METADATA_TYPE = new TypeReference<>() {
    };
    private static final List<String> DEFAULT_PRE_START_CHECKS = List.of(
            "Confirm correct property and service scope",
            "Review dispatch instructions",
            "Confirm required tools and equipment are available",
            "Capture before photo if needed"
    );
    private static final List<String> DEFAULT_COMPLETION_CHECKS = List.of(
            "Confirm work area is safe and clean",
            "Capture required after photo",
            "Record materials used or purchases",
            "Return assigned tools and equipment",
            "Add final field note"
    );
    private static final Set<String> LOCKED_WORK_ORDER_STATUSES = Set.of(
            "COMPLETED", "APPROVED", "CUSTOMER_NOTIFIED", "INVOICED", "PAID", "CANCELLED"
    );
    private static final Set<String> BILLING_READY_WORK_ORDER_STATUSES = Set.of("APPROVED", "CUSTOMER_NOTIFIED");
    private static final Set<String> WORK_ORDER_STATUSES = Set.of(
            "DRAFT", "TO_DO", "PENDING", "SCHEDULED", "ASSIGNED", "TRAVELING", "ON_SITE", "IN_PROGRESS",
            "PAUSED", "ON_HOLD", "PENDING_COMPLETION", "COMPLETED", "APPROVED", "CUSTOMER_NOTIFIED",
            "INVOICED", "PAID", "CANCELLED"
    );

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final WorkOrderNumberGenerator workOrderNumberGenerator;
    private final OwnerNotificationOperations ownerNotificationOperations;
    private final DocumentStorageService documentStorageService;
    private final ObjectMapper objectMapper;

    public WorkOrderManagementService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            WorkOrderNumberGenerator workOrderNumberGenerator,
            OwnerNotificationOperations ownerNotificationOperations,
            DocumentStorageService documentStorageService,
            ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.workOrderNumberGenerator = workOrderNumberGenerator;
        this.ownerNotificationOperations = ownerNotificationOperations;
        this.documentStorageService = documentStorageService;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<WorkOrderDto> list(UUID tenantId) {
        return workOrders(tenantId, null);
    }

    @Transactional(readOnly = true)
    public List<WorkOrderDto> list(UUID tenantId, String statusFilter, String dateFilter, LocalDate customFrom, LocalDate customTo) {
        return workOrders(tenantId, null, WorkOrderListFilters.of(statusFilter, dateFilter, customFrom, customTo));
    }

    @Transactional(readOnly = true)
    public List<WorkerAvailabilityDto> availability(
            UUID tenantId,
            UUID workOrderId,
            UUID serviceTypeId,
            Instant scheduledStart,
            Instant scheduledEnd
    ) {
        validateScheduleWindow(scheduledStart, scheduledEnd);
        return jdbcTemplate.query("""
                SELECT id, display_name, employee_number, engagement_type::text AS engagement_type
                FROM workers
                WHERE tenant_id = ? AND status = 'ACTIVE'
                ORDER BY display_name
                """, (rs, rowNum) -> {
            var workerId = rs.getObject("id", UUID.class);
            var skillMatched = serviceTypeId == null || workerCanPerformService(tenantId, workerId, serviceTypeId);
            var shiftCovered = scheduledStart == null || scheduledEnd == null || workerHasShiftCoverage(tenantId, workerId, scheduledStart, scheduledEnd);
            var scheduleConflict = scheduledStart != null && scheduledEnd != null && workerHasScheduleConflict(tenantId, workerId, scheduledStart, scheduledEnd, workOrderId);
            var available = skillMatched && shiftCovered && !scheduleConflict;
            return new WorkerAvailabilityDto(
                    workerId,
                    rs.getString("display_name"),
                    rs.getString("employee_number"),
                    rs.getString("engagement_type"),
                    skillMatched,
                    shiftCovered,
                    scheduleConflict,
                    available,
                    availabilityReason(skillMatched, shiftCovered, scheduleConflict, scheduledStart, scheduledEnd)
            );
        }, tenantId);
    }

    @Transactional
    public WorkOrderDto create(UUID tenantId, UUID actorUserId, CreateWorkOrderRequest request) {
        var property = property(tenantId, request.propertyId());
        requireTenantServiceType(tenantId, request.serviceTypeId());
        validateScheduleWindow(request.scheduledStart(), request.scheduledEnd());
        var assignedWorkerIds = assignedWorkerIds(request);
        var allowAvailabilityOverride = Boolean.TRUE.equals(request.allowAvailabilityOverride());
        requireAvailabilityOverrideReason(allowAvailabilityOverride, request.allowAvailabilityOverrideReason());
        for (var workerId : assignedWorkerIds) {
            requireTenantWorker(tenantId, workerId);
            validateWorkerAssignment(tenantId, workerId, request.serviceTypeId(), request.scheduledStart(), request.scheduledEnd(), null, allowAvailabilityOverride);
        }

        var source = source(request.source());
        var status = status(request.status(), source, assignedWorkerIds, request.scheduledStart());
        var priority = request.priority() == null || request.priority().isBlank() ? "NORMAL" : request.priority();
        var workOrderNumber = workOrderNumberGenerator.nextNumber();
        var workOrderId = jdbcTemplate.queryForObject("""
                INSERT INTO work_orders (
                    tenant_id, work_order_number, customer_id, property_id, service_type_id, title, description, status, priority,
                    scheduled_start, scheduled_end, source, requester_name, requester_email, requester_phone, requested_at,
                    recurrence_rule, recurrence_interval, recurrence_until, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?::work_order_status, ?::work_order_priority, ?, ?, ?::work_order_source, ?, ?, ?, now(), ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                workOrderNumber,
                property.ownerId(),
                request.propertyId(),
                request.serviceTypeId(),
                request.title(),
                request.description(),
                status,
                priority,
                timestamp(request.scheduledStart()),
                timestamp(request.scheduledEnd()),
                source,
                blankToNull(request.requesterName()),
                blankToNull(request.requesterEmail()),
                blankToNull(request.requesterPhone()),
                blankToNull(request.recurrenceRule()),
                request.recurrenceInterval(),
                request.recurrenceUntil(),
                actorUserId,
                actorUserId
        );

        replaceAssignments(tenantId, workOrderId, actorUserId, request, assignedWorkerIds);
        replaceMaterials(tenantId, workOrderId, actorUserId, request.materials());
        replaceAssets(tenantId, workOrderId, actorUserId, request.assetIds());

        var tasks = normalizedTasks(request, true);
        var insertedTaskIds = new ArrayList<UUID>();
        for (var index = 0; index < tasks.size(); index++) {
            var task = tasks.get(index);
            if (task.label() == null || task.label().isBlank()) {
                continue;
            }
            if (task.assignedWorkerId() != null && !assignedWorkerIds.contains(task.assignedWorkerId())) {
                throw new BadRequestException("Task assignee must also be assigned to the work order.");
            }
            var parentTaskId = task.parentIndex() == null || task.parentIndex() < 0 || task.parentIndex() >= insertedTaskIds.size()
                    ? null
                    : insertedTaskIds.get(task.parentIndex());
            var taskId = jdbcTemplate.queryForObject("""
                    INSERT INTO work_order_tasks (
                        tenant_id, work_order_id, parent_task_id, assigned_worker_id, label, sort_order,
                        checklist_phase, required, task_status, notes, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?::work_order_task_phase, ?, 'TO_DO', ?, ?, ?)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    workOrderId,
                    parentTaskId,
                    task.assignedWorkerId(),
                    task.label().trim(),
                    index + 1,
                    task.phase(),
                    task.required(),
                    blankToNull(task.notes()),
                    actorUserId,
                    actorUserId
            );
            insertedTaskIds.add(taskId);
        }

        var auditMetadata = new LinkedHashMap<String, Object>();
        auditMetadata.put("workOrderNumber", workOrderNumber);
        auditMetadata.put("title", request.title());
        auditMetadata.put("propertyId", request.propertyId().toString());
        auditMetadata.put("status", status);
        auditMetadata.put("source", source);
        auditMetadata.put("priority", priority);
        auditMetadata.put("assignedWorkerCount", assignedWorkerIds.size());
        auditMetadata.put("availabilityOverride", allowAvailabilityOverride);
        if (allowAvailabilityOverride) {
            auditMetadata.put("availabilityOverrideReason", blankToNull(request.allowAvailabilityOverrideReason()));
        }
        auditMetadata.put("materialCount", request.materials() == null ? 0 : request.materials().size());
        auditMetadata.put("assetCount", request.assetIds() == null ? 0 : request.assetIds().size());
        auditMetadata.put("taskCount", tasks.size());
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CREATED", "WORK_ORDER", workOrderId, auditMetadata);
        return workOrders(tenantId, workOrderId).stream().findFirst().orElseThrow();
    }

    @Transactional
    public WorkOrderDto update(UUID tenantId, UUID actorUserId, UUID workOrderId, CreateWorkOrderRequest request) {
        requireWorkOrder(tenantId, workOrderId);
        var before = workOrders(tenantId, workOrderId).stream().findFirst().orElseThrow();
        if (isLockedForGeneralUpdate(before.status())) {
            throw new BadRequestException("Submitted or completed work orders are locked. Use the review, approval, adjustment, or reassignment workflow instead.");
        }
        var property = property(tenantId, request.propertyId());
        requireTenantServiceType(tenantId, request.serviceTypeId());
        validateScheduleWindow(request.scheduledStart(), request.scheduledEnd());
        var assignedWorkerIds = assignedWorkerIds(request);
        var allowAvailabilityOverride = Boolean.TRUE.equals(request.allowAvailabilityOverride());
        requireAvailabilityOverrideReason(allowAvailabilityOverride, request.allowAvailabilityOverrideReason());
        for (var workerId : assignedWorkerIds) {
            requireTenantWorker(tenantId, workerId);
            validateWorkerAssignment(tenantId, workerId, request.serviceTypeId(), request.scheduledStart(), request.scheduledEnd(), workOrderId, allowAvailabilityOverride);
        }

        var source = source(request.source());
        var status = status(request.status(), source, assignedWorkerIds, request.scheduledStart());
        var priority = request.priority() == null || request.priority().isBlank() ? "NORMAL" : request.priority();
        jdbcTemplate.update("""
                UPDATE work_orders
                SET customer_id = ?, property_id = ?, service_type_id = ?, title = ?, description = ?,
                    status = ?::work_order_status, priority = ?::work_order_priority,
                    scheduled_start = ?, scheduled_end = ?, source = ?::work_order_source,
                    requester_name = ?, requester_email = ?, requester_phone = ?,
                    recurrence_rule = ?, recurrence_interval = ?, recurrence_until = ?,
                    updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """,
                property.ownerId(),
                request.propertyId(),
                request.serviceTypeId(),
                request.title(),
                request.description(),
                status,
                priority,
                timestamp(request.scheduledStart()),
                timestamp(request.scheduledEnd()),
                source,
                blankToNull(request.requesterName()),
                blankToNull(request.requesterEmail()),
                blankToNull(request.requesterPhone()),
                blankToNull(request.recurrenceRule()),
                request.recurrenceInterval(),
                request.recurrenceUntil(),
                actorUserId,
                tenantId,
                workOrderId
        );
        replaceAssignments(tenantId, workOrderId, actorUserId, request, assignedWorkerIds);
        replaceMaterials(tenantId, workOrderId, actorUserId, request.materials());
        replaceAssets(tenantId, workOrderId, actorUserId, request.assetIds());
        replaceTasks(tenantId, workOrderId, actorUserId, request, assignedWorkerIds);

        var after = workOrders(tenantId, workOrderId).stream().findFirst().orElseThrow();
        auditWorkOrderChanges(tenantId, actorUserId, workOrderId, before, after);
        if (allowAvailabilityOverride) {
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_AVAILABILITY_OVERRIDE_ACCEPTED", "WORK_ORDER", workOrderId, Map.of(
                    "workOrderNumber", after.workOrderNumber(),
                    "title", after.title(),
                    "reason", blankToNull(request.allowAvailabilityOverrideReason())
            ));
        }
        return after;
    }

    @Transactional(readOnly = true)
    public WorkOrderReviewDto review(UUID tenantId, UUID actorUserId, UUID workOrderId) {
        var workOrder = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        return new WorkOrderReviewDto(
                workOrder,
                fieldNotes(tenantId, workOrderId),
                evidence(tenantId, workOrderId),
                timeEntries(tenantId, workOrderId),
                invoices(tenantId, workOrderId),
                communications(tenantId, workOrderId),
                auditEntries(tenantId, workOrderId)
        );
    }

    @Transactional
    public WorkOrderDto cancel(UUID tenantId, UUID actorUserId, UUID workOrderId, CancelWorkOrderRequest request) {
        var reason = blankToNull(request.reason());
        if (reason == null) {
            throw new BadRequestException("Cancellation reason is required.");
        }
        var before = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        if (Set.of("CANCELLED", "INVOICED", "PAID").contains(before.status())) {
            throw new BadRequestException("This work order cannot be cancelled.");
        }
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = 'CANCELLED'::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, actorUserId, tenantId, workOrderId);
        jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET assignment_status = 'RELEASED'::work_order_assignment_status,
                    released_at = now(),
                    release_reason = ?,
                    updated_by = ?,
                    updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, reason, actorUserId, tenantId, workOrderId);
        jdbcTemplate.update("""
                UPDATE work_order_tasks
                SET task_status = 'CANCELLED'::work_order_task_status,
                    updated_by = ?,
                    updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ?
                  AND task_status NOT IN ('COMPLETED', 'CANCELLED')
                """, actorUserId, tenantId, workOrderId);
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CANCELLED", "WORK_ORDER", workOrderId, Map.of(
                "workOrderNumber", before.workOrderNumber(),
                "title", before.title(),
                "previousStatus", before.status(),
                "status", "CANCELLED",
                "reason", reason
        ));
        return workOrders(tenantId, workOrderId).stream().findFirst().orElseThrow();
    }

    @Transactional
    public WorkOrderReviewDto reviewAction(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderReviewActionRequest request) {
        var action = normalizeReviewAction(request.action());
        var note = blankToNull(request.note());
        var before = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        if ("OVERRIDE_COMPLETE".equals(action)) {
            return overrideComplete(tenantId, actorUserId, workOrderId, before, note);
        }
        if (!"PENDING_COMPLETION".equals(before.status())) {
            throw new BadRequestException("Only work orders pending completion can be reviewed.");
        }
        if ("SEND_BACK".equals(action) && note == null) {
            throw new BadRequestException("Send back reason is required.");
        }
        var approveAndInvoice = "APPROVE_AND_INVOICE".equals(action);
        if ("APPROVE".equals(action) || approveAndInvoice) {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'APPROVED'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ?
                    """, actorUserId, tenantId, workOrderId);
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_APPROVED", "WORK_ORDER", workOrderId, Map.of(
                    "workOrderNumber", before.workOrderNumber(),
                    "title", before.title(),
                    "previousStatus", before.status(),
                    "status", "APPROVED",
                    "note", note == null ? "" : note
            ));
            var delivery = ownerNotificationOperations.sendWorkOrderCompleted(
                    tenantId,
                    actorUserId,
                    completionEmail(tenantId, workOrderId, note)
            );
            if (!"FAILED".equals(delivery.status())) {
                jdbcTemplate.update("""
                        UPDATE work_orders
                        SET status = 'CUSTOMER_NOTIFIED'::work_order_status, updated_by = ?, updated_at = now()
                        WHERE tenant_id = ? AND id = ? AND status = 'APPROVED'
                        """, actorUserId, tenantId, workOrderId);
                auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CUSTOMER_NOTIFIED", "WORK_ORDER", workOrderId, Map.of(
                        "workOrderNumber", before.workOrderNumber(),
                        "recipientEmail", delivery.recipientEmail(),
                        "deliveryStatus", delivery.status()
                ));
            }
            if (approveAndInvoice) {
                return generateInvoice(tenantId, actorUserId, workOrderId);
            }
        } else {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'IN_PROGRESS'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ?
                    """, actorUserId, tenantId, workOrderId);
            jdbcTemplate.update("""
                    UPDATE work_order_assignments
                    SET assignment_status = 'IN_PROGRESS'::work_order_assignment_status,
                        notes = concat_ws(E'\n', nullif(notes, ''), ?),
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND work_order_id = ? AND assignment_status = 'COMPLETED'
                    """, "Correction requested: " + note, actorUserId, tenantId, workOrderId);
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_SENT_BACK", "WORK_ORDER", workOrderId, Map.of(
                    "workOrderNumber", before.workOrderNumber(),
                    "title", before.title(),
                    "previousStatus", before.status(),
                    "status", "IN_PROGRESS",
                    "reason", note
            ));
        }
        return review(tenantId, actorUserId, workOrderId);
    }

    private WorkOrderReviewDto overrideComplete(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderDto before, String note) {
        if (note == null) {
            throw new BadRequestException("Override completion reason is required.");
        }
        if (Set.of("PENDING_COMPLETION", "APPROVED", "CUSTOMER_NOTIFIED", "INVOICED", "PAID", "CANCELLED").contains(before.status())) {
            throw new BadRequestException("This work order cannot be override-completed from its current status.");
        }
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = 'PENDING_COMPLETION'::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, actorUserId, tenantId, workOrderId);
        jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET assignment_status = 'RELEASED'::work_order_assignment_status,
                    released_at = now(),
                    release_reason = ?,
                    notes = concat_ws(E'\n', nullif(notes, ''), ?),
                    updated_by = ?,
                    updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, note, "Operations override completion: " + note, actorUserId, tenantId, workOrderId);
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_OVERRIDE_COMPLETED", "WORK_ORDER", workOrderId, Map.of(
                "workOrderNumber", before.workOrderNumber(),
                "title", before.title(),
                "previousStatus", before.status(),
                "status", "PENDING_COMPLETION",
                "reason", note
        ));
        return review(tenantId, actorUserId, workOrderId);
    }

    @Transactional
    public WorkOrderReviewDto notifyOwner(UUID tenantId, UUID actorUserId, UUID workOrderId, SendWorkOrderOwnerEmailRequest request) {
        var workOrder = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        if (!Set.of("APPROVED", "CUSTOMER_NOTIFIED", "INVOICED").contains(workOrder.status())) {
            throw new BadRequestException("Owner can be notified only after work is approved.");
        }
        var delivery = ownerNotificationOperations.sendWorkOrderCompleted(
                tenantId,
                actorUserId,
                completionEmail(tenantId, workOrderId, blankToNull(request == null ? null : request.note()))
        );
        if (!"FAILED".equals(delivery.status())) {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'CUSTOMER_NOTIFIED'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ? AND status = 'APPROVED'
                    """, actorUserId, tenantId, workOrderId);
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CUSTOMER_NOTIFIED", "WORK_ORDER", workOrderId, Map.of(
                    "workOrderNumber", workOrder.workOrderNumber(),
                    "recipientEmail", delivery.recipientEmail(),
                    "deliveryStatus", delivery.status()
            ));
        }
        return review(tenantId, actorUserId, workOrderId);
    }

    @Transactional
    public WorkOrderReviewDto generateInvoice(UUID tenantId, UUID actorUserId, UUID workOrderId) {
        var workOrder = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        if (!Set.of("APPROVED", "CUSTOMER_NOTIFIED", "INVOICED").contains(workOrder.status())) {
            throw new BadRequestException("Invoice can be generated only after work is approved.");
        }
        var existing = invoices(tenantId, workOrderId);
        if (!existing.isEmpty()) {
            return review(tenantId, actorUserId, workOrderId);
        }
        var invoiceId = UUID.randomUUID();
        var invoiceNumber = invoiceNumber();
        var today = LocalDate.now(tenantZoneId(tenantId));
        var dueOn = today.plusDays(30);
        var lines = invoiceLines(tenantId, workOrder);
        var subtotal = lines.stream()
                .map(InvoiceLineDraft::lineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        var taxTotal = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        var total = subtotal.add(taxTotal).setScale(2, RoundingMode.HALF_UP);
        jdbcTemplate.update("""
                INSERT INTO invoices (
                    id, tenant_id, customer_id, work_order_id, invoice_number, status,
                    issued_on, due_on, subtotal, tax_total, total, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, 'DRAFT'::invoice_status, ?, ?, ?, ?, ?, ?, ?)
                """,
                invoiceId,
                tenantId,
                workOrder.ownerId(),
                workOrderId,
                invoiceNumber,
                today,
                dueOn,
                subtotal,
                taxTotal,
                total,
                actorUserId,
                actorUserId
        );
        for (var line : lines) {
            jdbcTemplate.update("""
                    INSERT INTO invoice_lines (
                        tenant_id, invoice_id, description, quantity, unit_price, line_total, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    tenantId,
                    invoiceId,
                    line.description(),
                    line.quantity(),
                    line.unitPrice(),
                    line.lineTotal(),
                    actorUserId,
                    actorUserId
            );
        }
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = 'INVOICED'::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, actorUserId, tenantId, workOrderId);
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_INVOICE_GENERATED", "WORK_ORDER", workOrderId, Map.of(
                "workOrderNumber", workOrder.workOrderNumber(),
                "invoiceId", invoiceId.toString(),
                "invoiceNumber", invoiceNumber,
                "subtotal", subtotal,
                "taxTotal", taxTotal,
                "total", total,
                "lineCount", lines.size(),
                "serviceLineCount", lines.stream().filter(InvoiceLineDraft::serviceLine).count(),
                "materialLineCount", lines.stream().filter(InvoiceLineDraft::materialLine).count(),
                "lineDescriptions", lines.stream().map(InvoiceLineDraft::description).toList()
        ));
        return review(tenantId, actorUserId, workOrderId);
    }

    private List<WorkOrderDto> workOrders(UUID tenantId, UUID workOrderId) {
        return workOrders(tenantId, workOrderId, WorkOrderListFilters.all());
    }

    private List<WorkOrderDto> workOrders(UUID tenantId, UUID workOrderId, WorkOrderListFilters filters) {
        var sql = new StringBuilder("""
                SELECT wo.id, wo.customer_id, c.display_name AS owner_name, wo.property_id, p.name AS property_name,
                       p.address_line1 || ', ' || p.city AS property_address, wo.service_type_id, st.name AS service_name,
                       wo.work_order_number, wo.title, wo.description, wo.status::text AS status, wo.source::text AS source, wo.priority::text AS priority,
                       wo.scheduled_start, wo.scheduled_end, wo.requester_name, wo.requester_email, wo.requester_phone,
                       wo.recurrence_rule, wo.recurrence_interval, wo.recurrence_until
                FROM work_orders wo
                JOIN customers c ON c.id = wo.customer_id AND c.tenant_id = wo.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                WHERE wo.tenant_id = ?
                """);
        var args = new ArrayList<Object>();
        args.add(tenantId);
        if (workOrderId != null) {
            sql.append(" AND wo.id = ? ");
            args.add(workOrderId);
        }
        applyStatusFilter(sql, filters);
        applyDateFilter(sql, args, tenantId, filters);
        sql.append(" ORDER BY wo.scheduled_start NULLS LAST, wo.updated_at DESC ");

        var rows = jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new WorkOrderRow(
                rs.getObject("id", UUID.class),
                rs.getString("work_order_number"),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_name"),
                rs.getObject("property_id", UUID.class),
                rs.getString("property_name"),
                rs.getString("property_address"),
                rs.getObject("service_type_id", UUID.class),
                rs.getString("service_name"),
                rs.getString("title"),
                rs.getString("description"),
                rs.getString("status"),
                rs.getString("source"),
                rs.getString("priority"),
                instant("scheduled_start", rs),
                instant("scheduled_end", rs),
                rs.getString("requester_name"),
                rs.getString("requester_email"),
                rs.getString("requester_phone"),
                rs.getString("recurrence_rule"),
                (Integer) rs.getObject("recurrence_interval"),
                rs.getObject("recurrence_until", LocalDate.class)
        ), args.toArray());

        var workOrderIds = rows.stream()
                .map(WorkOrderRow::id)
                .collect(java.util.stream.Collectors.toCollection(LinkedHashSet::new));
        var assignments = assignmentsByWorkOrder(tenantId, workOrderIds);
        var materials = materialsByWorkOrder(tenantId, workOrderIds);
        var assets = assetsByWorkOrder(tenantId, workOrderIds);
        var tasks = tasksByWorkOrder(tenantId, workOrderIds);
        return rows.stream()
                .map(row -> new WorkOrderDto(
                        row.id(),
                        row.workOrderNumber(),
                        row.ownerId(),
                        row.ownerName(),
                        row.propertyId(),
                        row.propertyName(),
                        row.propertyAddress(),
                        row.serviceTypeId(),
                        row.serviceName(),
                        row.title(),
                        row.description(),
                        row.status(),
                        row.source(),
                        row.priority(),
                        row.scheduledStart(),
                        row.scheduledEnd(),
                        row.requesterName(),
                        row.requesterEmail(),
                        row.requesterPhone(),
                        row.recurrenceRule(),
                        row.recurrenceInterval(),
                        row.recurrenceUntil(),
                        assignments.getOrDefault(row.id(), List.of()),
                        materials.getOrDefault(row.id(), List.of()),
                        assets.getOrDefault(row.id(), List.of()),
                        tasks.getOrDefault(row.id(), List.of())
                ))
                .toList();
    }

    private WorkOrderCompletionEmail completionEmail(UUID tenantId, UUID workOrderId, String reviewNote) {
        return jdbcTemplate.query("""
                SELECT wo.id, wo.work_order_number, wo.title, c.id AS customer_id,
                       c.display_name AS owner_name, c.email AS owner_email, c.billing_email AS owner_billing_email,
                       p.name AS property_name,
                       trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address,
                       st.name AS service_name,
                       coalesce((
                           SELECT max(al.created_at)
                           FROM audit_logs al
                           WHERE al.tenant_id = wo.tenant_id
                             AND al.resource_type = 'WORK_ORDER'
                             AND al.resource_id = wo.id
                             AND al.action = 'WORKER_COMPLETE_WORK'
                       ), wo.updated_at) AS completed_at
                FROM work_orders wo
                JOIN customers c ON c.id = wo.customer_id AND c.tenant_id = wo.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                WHERE wo.tenant_id = ? AND wo.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Work order not found.");
            }
            return new WorkOrderCompletionEmail(
                    rs.getObject("id", UUID.class),
                    rs.getString("work_order_number"),
                    rs.getString("title"),
                    rs.getObject("customer_id", UUID.class),
                    rs.getString("owner_name"),
                    rs.getString("owner_email"),
                    rs.getString("owner_billing_email"),
                    rs.getString("property_name"),
                    rs.getString("property_address"),
                    rs.getString("service_name"),
                    instant("completed_at", rs),
                    reviewNote
            );
        }, tenantId, workOrderId);
    }

    private List<WorkOrderReviewDto.FieldNoteDto> fieldNotes(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT wofn.id, wofn.worker_id, coalesce(w.display_name, au.display_name, 'Field worker') AS worker_name,
                       coalesce(w.email, au.email, '') AS worker_email,
                       wofn.note, wofn.created_at, wofn.updated_at
                FROM work_order_field_notes wofn
                LEFT JOIN workers w ON w.id = wofn.worker_id AND w.tenant_id = wofn.tenant_id
                LEFT JOIN app_users au ON au.id = wofn.created_by
                WHERE wofn.tenant_id = ? AND wofn.work_order_id = ?
                ORDER BY wofn.created_at DESC
                """, (rs, rowNum) -> new WorkOrderReviewDto.FieldNoteDto(
                rs.getObject("id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                rs.getString("worker_name"),
                rs.getString("worker_email"),
                rs.getString("note"),
                instant("created_at", rs),
                instant("updated_at", rs)
        ), tenantId, workOrderId);
    }

    private List<WorkOrderReviewDto.EvidenceDto> evidence(UUID tenantId, UUID workOrderId) {
        var photos = new ArrayList<WorkOrderReviewDto.EvidenceDto>();
        jdbcTemplate.query("""
                SELECT d.id AS document_id, 'WORK_PHOTO' AS document_type, wop.photo_type, wop.caption,
                       d.bucket, d.object_key, d.content_type, d.byte_size,
                       w.id AS worker_id,
                       coalesce(au.display_name, 'Field worker') AS created_by_name,
                       coalesce(w.email, au.email, '') AS created_by_email,
                       wop.captured_at, d.created_at, '{}'::text AS metadata
                FROM work_order_photos wop
                JOIN documents d ON d.id = wop.document_id AND d.tenant_id = wop.tenant_id
                LEFT JOIN workers w ON w.user_id = wop.created_by AND w.tenant_id = wop.tenant_id
                LEFT JOIN app_users au ON au.id = wop.created_by
                WHERE wop.tenant_id = ? AND wop.work_order_id = ?
                ORDER BY wop.captured_at DESC NULLS LAST, wop.created_at DESC
                """, (RowCallbackHandler) rs -> photos.add(new WorkOrderReviewDto.EvidenceDto(
                rs.getObject("document_id", UUID.class),
                rs.getString("document_type"),
                rs.getString("photo_type"),
                rs.getString("caption"),
                rs.getString("bucket"),
                rs.getString("object_key"),
                documentStorageService.createReadUrl(rs.getString("bucket"), rs.getString("object_key")),
                rs.getString("content_type"),
                (Long) rs.getObject("byte_size"),
                rs.getObject("worker_id", UUID.class),
                rs.getString("created_by_name"),
                rs.getString("created_by_email"),
                instant("captured_at", rs),
                instant("created_at", rs),
                metadata(rs.getString("metadata"))
        )), tenantId, workOrderId);
        jdbcTemplate.query("""
                SELECT d.id AS document_id, 'PURCHASE_RECEIPT' AS document_type, NULL::text AS photo_type,
                       coalesce(al.metadata ->> 'caption', al.metadata ->> 'vendorName', '') AS caption,
                       d.bucket, d.object_key, d.content_type, d.byte_size,
                       w.id AS worker_id,
                       coalesce(au.display_name, 'Field worker') AS created_by_name,
                       coalesce(w.email, au.email, '') AS created_by_email,
                       al.created_at AS captured_at, d.created_at, al.metadata::text AS metadata
                FROM audit_logs al
                JOIN documents d ON d.id = (al.metadata ->> 'documentId')::uuid
                  AND d.tenant_id = al.tenant_id
                  AND d.owner_type = 'WORK_ORDER'
                  AND d.owner_id = al.resource_id
                LEFT JOIN app_users au ON au.id = al.actor_user_id
                LEFT JOIN workers w ON w.user_id = al.actor_user_id AND w.tenant_id = al.tenant_id
                WHERE al.tenant_id = ?
                  AND al.resource_type = 'WORK_ORDER'
                  AND al.resource_id = ?
                  AND al.action = 'WORKER_PURCHASE_RECEIPT_UPLOADED'
                  AND jsonb_exists(al.metadata, 'documentId')
                ORDER BY al.created_at DESC
                """, (RowCallbackHandler) rs -> photos.add(new WorkOrderReviewDto.EvidenceDto(
                rs.getObject("document_id", UUID.class),
                rs.getString("document_type"),
                rs.getString("photo_type"),
                rs.getString("caption"),
                rs.getString("bucket"),
                rs.getString("object_key"),
                documentStorageService.createReadUrl(rs.getString("bucket"), rs.getString("object_key")),
                rs.getString("content_type"),
                (Long) rs.getObject("byte_size"),
                rs.getObject("worker_id", UUID.class),
                rs.getString("created_by_name"),
                rs.getString("created_by_email"),
                instant("captured_at", rs),
                instant("created_at", rs),
                metadata(rs.getString("metadata"))
        )), tenantId, workOrderId);
        return photos.stream()
                .sorted((left, right) -> nullLast(right.createdAt()).compareTo(nullLast(left.createdAt())))
                .toList();
    }

    private List<WorkOrderReviewDto.TimeEntryDto> timeEntries(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                WITH target_work_order AS (
                    SELECT id, tenant_id, scheduled_start, scheduled_end, created_at
                    FROM work_orders
                    WHERE tenant_id = ? AND id = ?
                ),
                assigned_workers AS (
                    SELECT worker_id
                    FROM work_order_assignments
                    WHERE tenant_id = ? AND work_order_id = ?
                ),
                work_time AS (
                    SELECT wote.id, wote.worker_id, coalesce(w.display_name, 'Field worker') AS worker_name,
                           wote.entry_type, wote.started_at, wote.ended_at,
                           CASE WHEN wote.ended_at IS NULL THEN NULL
                                ELSE floor(extract(epoch from (wote.ended_at - wote.started_at)) / 60)::bigint
                           END AS duration_minutes
                    FROM work_order_time_entries wote
                    LEFT JOIN workers w ON w.id = wote.worker_id AND w.tenant_id = wote.tenant_id
                    WHERE wote.tenant_id = ? AND wote.work_order_id = ?
                ),
                shift_time AS (
                    SELECT wsce.id, wsce.worker_id, coalesce(w.display_name, 'Field worker') AS worker_name,
                           'SHIFT_CLOCK' AS entry_type, wsce.started_at, wsce.ended_at,
                           CASE WHEN wsce.ended_at IS NULL THEN NULL
                                ELSE floor(extract(epoch from (wsce.ended_at - wsce.started_at)) / 60)::bigint
                           END AS duration_minutes
                    FROM worker_shift_clock_entries wsce
                    JOIN assigned_workers aw ON aw.worker_id = wsce.worker_id
                    JOIN target_work_order two ON two.tenant_id = wsce.tenant_id
                    LEFT JOIN workers w ON w.id = wsce.worker_id AND w.tenant_id = wsce.tenant_id
                    WHERE wsce.tenant_id = ?
                      AND wsce.started_at < coalesce(two.scheduled_end, two.scheduled_start, two.created_at) + interval '18 hours'
                      AND coalesce(wsce.ended_at, now()) > coalesce(two.scheduled_start, two.created_at) - interval '18 hours'
                )
                SELECT id, worker_id, worker_name, entry_type, started_at, ended_at, duration_minutes FROM work_time
                UNION ALL
                SELECT id, worker_id, worker_name, entry_type, started_at, ended_at, duration_minutes FROM shift_time
                ORDER BY started_at DESC
                """, (rs, rowNum) -> new WorkOrderReviewDto.TimeEntryDto(
                rs.getObject("id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                rs.getString("worker_name"),
                rs.getString("entry_type"),
                instant("started_at", rs),
                instant("ended_at", rs),
                (Long) rs.getObject("duration_minutes")
        ), tenantId, workOrderId, tenantId, workOrderId, tenantId, workOrderId, tenantId);
    }

    private List<WorkOrderReviewDto.InvoiceDto> invoices(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT id, invoice_number, status::text AS status, issued_on::text AS issued_on,
                       due_on::text AS due_on, subtotal::text AS subtotal, tax_total::text AS tax_total, total::text AS total
                FROM invoices
                WHERE tenant_id = ? AND work_order_id = ? AND status <> 'VOID'
                ORDER BY created_at DESC
                """, (rs, rowNum) -> new WorkOrderReviewDto.InvoiceDto(
                rs.getObject("id", UUID.class),
                rs.getString("invoice_number"),
                rs.getString("status"),
                rs.getString("issued_on"),
                rs.getString("due_on"),
                rs.getString("subtotal"),
                rs.getString("tax_total"),
                rs.getString("total")
        ), tenantId, workOrderId);
    }

    private List<WorkOrderReviewDto.CommunicationDto> communications(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT edl.id,
                       CASE
                         WHEN edl.invoice_id IS NOT NULL THEN 'INVOICE_EMAIL'
                         WHEN edl.work_order_id IS NOT NULL THEN 'WORK_ORDER_COMPLETION'
                         ELSE 'OWNER_EMAIL'
                       END AS communication_type,
                       edl.invoice_id,
                       i.invoice_number,
                       edl.recipient_email,
                       edl.subject,
                       edl.body,
                       edl.status,
                       edl.provider_message,
                       edl.sent_at,
                       edl.created_at
                FROM email_delivery_logs edl
                LEFT JOIN invoices i ON i.id = edl.invoice_id AND i.tenant_id = edl.tenant_id
                WHERE edl.tenant_id = ?
                  AND (edl.work_order_id = ? OR i.work_order_id = ?)
                ORDER BY edl.created_at DESC
                LIMIT 100
                """, (rs, rowNum) -> new WorkOrderReviewDto.CommunicationDto(
                rs.getObject("id", UUID.class),
                rs.getString("communication_type"),
                rs.getObject("invoice_id", UUID.class),
                rs.getString("invoice_number"),
                rs.getString("recipient_email"),
                rs.getString("subject"),
                rs.getString("body"),
                rs.getString("status"),
                rs.getString("provider_message"),
                instant("sent_at", rs),
                instant("created_at", rs)
        ), tenantId, workOrderId, workOrderId);
    }

    private List<WorkOrderReviewDto.AuditEntryDto> auditEntries(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT al.id, al.actor_user_id, au.display_name AS actor_name, au.email AS actor_email,
                       al.action, al.metadata::text AS metadata, al.created_at
                FROM audit_logs al
                LEFT JOIN app_users au ON au.id = al.actor_user_id
                WHERE al.tenant_id = ?
                  AND al.resource_type = 'WORK_ORDER'
                  AND al.resource_id = ?
                ORDER BY al.created_at DESC
                LIMIT 500
                """, (rs, rowNum) -> new WorkOrderReviewDto.AuditEntryDto(
                rs.getObject("id", UUID.class),
                rs.getObject("actor_user_id", UUID.class),
                rs.getString("actor_name"),
                rs.getString("actor_email"),
                rs.getString("action"),
                metadata(rs.getString("metadata")),
                instant("created_at", rs)
        ), tenantId, workOrderId);
    }

    private Instant nullLast(Instant value) {
        return value == null ? Instant.EPOCH : value;
    }

    private List<InvoiceLineDraft> invoiceLines(UUID tenantId, WorkOrderDto workOrder) {
        var lines = new ArrayList<InvoiceLineDraft>();
        var serviceLine = jdbcTemplate.query("""
                SELECT coalesce(st.name, ?) AS service_name, coalesce(st.base_price, 0) AS base_price
                FROM work_orders wo
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                WHERE wo.tenant_id = ? AND wo.id = ?
                """, rs -> {
            if (!rs.next()) {
                return null;
            }
            var price = money(rs.getBigDecimal("base_price"));
            if (price.signum() <= 0) {
                return null;
            }
            return new InvoiceLineDraft(
                    rs.getString("service_name"),
                    BigDecimal.ONE.setScale(2, RoundingMode.HALF_UP),
                    price,
                    price,
                    "SERVICE"
            );
        }, workOrder.title(), tenantId, workOrder.id());
        if (serviceLine != null) {
            lines.add(serviceLine);
        }
        lines.addAll(jdbcTemplate.query("""
                SELECT coalesce(ii.name, wom.description) AS description, wom.quantity, coalesce(wom.unit_cost, 0) AS unit_cost
                FROM work_order_materials wom
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE wom.tenant_id = ? AND wom.work_order_id = ? AND wom.used = true
                ORDER BY wom.created_at, wom.description
                """, (rs, rowNum) -> {
            var quantity = money(rs.getBigDecimal("quantity"));
            var unitPrice = money(rs.getBigDecimal("unit_cost"));
            var lineTotal = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
            return new InvoiceLineDraft(
                    "Material: " + rs.getString("description"),
                    quantity,
                    unitPrice,
                    lineTotal,
                    "MATERIAL"
            );
        }, tenantId, workOrder.id()).stream().filter(line -> line.lineTotal().signum() > 0).toList());
        if (lines.isEmpty()) {
            lines.add(new InvoiceLineDraft(
                    workOrder.title(),
                    BigDecimal.ONE.setScale(2, RoundingMode.HALF_UP),
                    BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                    BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                    "SERVICE"
            ));
        }
        return lines;
    }

    private BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private String invoiceNumber() {
        return "INV-%s-%s".formatted(
                LocalDate.now().toString().replace("-", ""),
                UUID.randomUUID().toString().substring(0, 6).toUpperCase()
        );
    }

    private void requireWorkOrder(UUID tenantId, UUID workOrderId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM work_orders WHERE tenant_id = ? AND id = ?)",
                Boolean.class,
                tenantId,
                workOrderId
        ));
        if (!exists) {
            throw new ResourceNotFoundException("Work order not found.");
        }
    }

    private PropertyRef property(UUID tenantId, UUID propertyId) {
        return jdbcTemplate.query("""
                SELECT p.id, p.customer_id
                FROM properties p
                WHERE p.tenant_id = ? AND p.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Property not found.");
            }
            return new PropertyRef(rs.getObject("id", UUID.class), rs.getObject("customer_id", UUID.class));
        }, tenantId, propertyId);
    }

    private void requireTenantServiceType(UUID tenantId, UUID serviceTypeId) {
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

    private void requireTenantWorker(UUID tenantId, UUID workerId) {
        if (workerId == null) {
            return;
        }
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM workers WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE')",
                Boolean.class,
                tenantId,
                workerId
        ));
        if (!exists) {
            throw new BadRequestException("Worker is not active for this tenant.");
        }
    }

    private void validateWorkerAssignment(
            UUID tenantId,
            UUID workerId,
            UUID serviceTypeId,
            Instant scheduledStart,
            Instant scheduledEnd,
            UUID currentWorkOrderId,
            boolean allowAvailabilityOverride
    ) {
        if (workerId == null) {
            return;
        }
        if (serviceTypeId != null && !workerCanPerformService(tenantId, workerId, serviceTypeId)) {
            throw new BadRequestException("Worker is not qualified for the selected service.");
        }
        if (scheduledStart == null || scheduledEnd == null) {
            return;
        }
        if (!scheduledEnd.isAfter(scheduledStart)) {
            throw new BadRequestException("Scheduled end must be after scheduled start.");
        }
        if (allowAvailabilityOverride) {
            return;
        }
        if (!workerHasShiftCoverage(tenantId, workerId, scheduledStart, scheduledEnd)) {
            throw new BadRequestException("Worker is not available during the selected schedule window.");
        }
        if (workerHasScheduleConflict(tenantId, workerId, scheduledStart, scheduledEnd, currentWorkOrderId)) {
            throw new BadRequestException("Worker already has an overlapping work order.");
        }
    }

    private void validateScheduleWindow(Instant scheduledStart, Instant scheduledEnd) {
        if (scheduledStart != null && scheduledEnd != null && !scheduledEnd.isAfter(scheduledStart)) {
            throw new BadRequestException("Scheduled end must be after scheduled start.");
        }
    }

    private void requireAvailabilityOverrideReason(boolean allowAvailabilityOverride, String reason) {
        if (allowAvailabilityOverride && blankToNull(reason) == null) {
            throw new BadRequestException("Dispatch override reason is required.");
        }
    }

    private boolean workerCanPerformService(UUID tenantId, UUID workerId, UUID serviceTypeId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM worker_service_skills
                    WHERE tenant_id = ? AND worker_id = ? AND service_type_id = ?
                )
                """, Boolean.class, tenantId, workerId, serviceTypeId));
    }

    private String availabilityReason(boolean skillMatched, boolean shiftCovered, boolean scheduleConflict, Instant scheduledStart, Instant scheduledEnd) {
        if (!skillMatched) {
            return "Missing service skill";
        }
        if (scheduledStart == null || scheduledEnd == null) {
            return "Schedule open";
        }
        if (!shiftCovered) {
            return "Outside shift";
        }
        if (scheduleConflict) {
            return "Schedule conflict";
        }
        return "Available";
    }

    private boolean workerHasShiftCoverage(UUID tenantId, UUID workerId, Instant scheduledStart, Instant scheduledEnd) {
        var zoneId = tenantZoneId(tenantId);
        var localStart = scheduledStart.atZone(zoneId).toLocalDateTime();
        var localEnd = scheduledEnd.atZone(zoneId).toLocalDateTime();
        if (!LocalDate.from(localStart).equals(LocalDate.from(localEnd))) {
            return false;
        }
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM worker_shift_templates
                    WHERE tenant_id = ? AND worker_id = ? AND active = true
                      AND day_of_week = ?
                      AND start_time <= ?
                      AND end_time >= ?
                )
                """,
                Boolean.class,
                tenantId,
                workerId,
                localStart.getDayOfWeek().getValue(),
                localStart.toLocalTime(),
                localEnd.toLocalTime()
        ));
    }

    private boolean workerHasScheduleConflict(UUID tenantId, UUID workerId, Instant scheduledStart, Instant scheduledEnd, UUID currentWorkOrderId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_assignments woa
                    JOIN work_orders wo ON wo.id = woa.work_order_id AND wo.tenant_id = woa.tenant_id
                    WHERE woa.tenant_id = ? AND woa.worker_id = ?
                      AND (?::uuid IS NULL OR wo.id <> ?::uuid)
                      AND wo.status NOT IN ('CANCELLED', 'COMPLETED')
                      AND wo.scheduled_start IS NOT NULL
                      AND wo.scheduled_end IS NOT NULL
                      AND ?::timestamptz < wo.scheduled_end
                      AND ?::timestamptz > wo.scheduled_start
                )
                """, Boolean.class, tenantId, workerId, currentWorkOrderId, currentWorkOrderId, timestamp(scheduledStart), timestamp(scheduledEnd)));
    }

    private ZoneId tenantZoneId(UUID tenantId) {
        var timezone = jdbcTemplate.queryForObject("SELECT timezone FROM tenants WHERE id = ?", String.class, tenantId);
        return ZoneId.of(timezone == null || timezone.isBlank() ? "America/Toronto" : timezone);
    }

    private void applyStatusFilter(StringBuilder sql, WorkOrderListFilters filters) {
        var statusFilter = filters.statusFilter();
        if ("ALL".equals(statusFilter)) {
            return;
        }
        if ("OPEN".equals(statusFilter)) {
            sql.append(" AND wo.status::text NOT IN ('COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED') ");
            return;
        }
        if ("REVIEW".equals(statusFilter)) {
            sql.append(" AND wo.status::text = 'PENDING_COMPLETION' ");
            return;
        }
        if ("BILLING".equals(statusFilter)) {
            sql.append(" AND wo.status::text IN ('APPROVED', 'CUSTOMER_NOTIFIED') ");
            return;
        }
        if (!WORK_ORDER_STATUSES.contains(statusFilter)) {
            throw new BadRequestException("Unknown work order status filter.");
        }
        sql.append(" AND wo.status::text = '").append(statusFilter).append("' ");
    }

    private void applyDateFilter(StringBuilder sql, List<Object> args, UUID tenantId, WorkOrderListFilters filters) {
        var dateFilter = filters.dateFilter();
        if ("ALL".equals(dateFilter)) {
            return;
        }
        if ("UNSCHEDULED".equals(dateFilter)) {
            sql.append(" AND wo.scheduled_start IS NULL ");
            return;
        }
        var zoneId = tenantZoneId(tenantId);
        var today = LocalDate.now(zoneId);
        switch (dateFilter) {
            case "TODAY" -> appendScheduledRange(sql, args, today, today.plusDays(1), zoneId);
            case "TOMORROW" -> appendScheduledRange(sql, args, today.plusDays(1), today.plusDays(2), zoneId);
            case "THIS_WEEK" -> appendScheduledRange(sql, args, today, startOfNextWeek(today), zoneId);
            case "NEXT_7" -> appendScheduledRange(sql, args, today, today.plusDays(7), zoneId);
            case "OVERDUE" -> {
                sql.append("""
                         AND wo.scheduled_start IS NOT NULL
                         AND wo.scheduled_start < ?::timestamptz
                         AND wo.status::text NOT IN ('COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED')
                        """);
                args.add(timestamp(today.atStartOfDay(zoneId).toInstant()));
            }
            case "PAST" -> {
                sql.append(" AND wo.scheduled_start IS NOT NULL AND wo.scheduled_start < ?::timestamptz ");
                args.add(timestamp(today.atStartOfDay(zoneId).toInstant()));
            }
            case "CUSTOM" -> appendCustomScheduledRange(sql, args, filters.customFrom(), filters.customTo(), zoneId);
            default -> throw new BadRequestException("Unknown work order date filter.");
        }
    }

    private void appendScheduledRange(StringBuilder sql, List<Object> args, LocalDate start, LocalDate end, ZoneId zoneId) {
        sql.append("""
                 AND wo.scheduled_start IS NOT NULL
                 AND wo.scheduled_start >= ?::timestamptz
                 AND wo.scheduled_start < ?::timestamptz
                """);
        args.add(timestamp(start.atStartOfDay(zoneId).toInstant()));
        args.add(timestamp(end.atStartOfDay(zoneId).toInstant()));
    }

    private void appendCustomScheduledRange(StringBuilder sql, List<Object> args, LocalDate customFrom, LocalDate customTo, ZoneId zoneId) {
        if (customFrom != null && customTo != null && customTo.isBefore(customFrom)) {
            throw new BadRequestException("Custom date end must be on or after start.");
        }
        if (customFrom == null && customTo == null) {
            return;
        }
        sql.append(" AND wo.scheduled_start IS NOT NULL ");
        if (customFrom != null) {
            sql.append(" AND wo.scheduled_start >= ?::timestamptz ");
            args.add(timestamp(customFrom.atStartOfDay(zoneId).toInstant()));
        }
        if (customTo != null) {
            sql.append(" AND wo.scheduled_start < ?::timestamptz ");
            args.add(timestamp(customTo.plusDays(1).atStartOfDay(zoneId).toInstant()));
        }
    }

    private LocalDate startOfNextWeek(LocalDate today) {
        var day = today.getDayOfWeek().getValue();
        return today.plusDays(day == 7 ? 1 : 8L - day);
    }

    private String placeholders(Set<UUID> ids) {
        return String.join(", ", ids.stream().map(ignored -> "?").toList());
    }

    private Object[] tenantAndWorkOrderArgs(UUID tenantId, Set<UUID> workOrderIds) {
        var args = new ArrayList<Object>();
        args.add(tenantId);
        args.addAll(workOrderIds);
        return args.toArray();
    }

    private Map<UUID, List<WorkOrderDto.AssignmentDto>> assignmentsByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var assignments = new LinkedHashMap<UUID, List<WorkOrderDto.AssignmentDto>>();
        jdbcTemplate.query("""
                SELECT woa.work_order_id, woa.worker_id,
                       COALESCE(u.display_name, w.display_name) AS display_name,
                       COALESCE(u.email, w.email) AS email,
                       woa.lead_worker,
                       woa.assignment_status::text AS assignment_status, woa.assignment_role, woa.notes
                FROM work_order_assignments woa
                JOIN workers w ON w.id = woa.worker_id AND w.tenant_id = woa.tenant_id
                LEFT JOIN app_users u ON u.id = w.user_id
                WHERE woa.tenant_id = ?
                  AND woa.work_order_id IN (%s)
                ORDER BY woa.lead_worker DESC, COALESCE(u.display_name, w.display_name)
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> assignments.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.AssignmentDto(
                        rs.getObject("worker_id", UUID.class),
                        rs.getString("display_name"),
                        rs.getString("email"),
                        rs.getBoolean("lead_worker"),
                        rs.getString("assignment_status"),
                        rs.getString("assignment_role"),
                        rs.getString("notes")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return assignments;
    }

    private Map<UUID, List<WorkOrderDto.MaterialDto>> materialsByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var materials = new LinkedHashMap<UUID, List<WorkOrderDto.MaterialDto>>();
        jdbcTemplate.query("""
                SELECT wom.id, wom.work_order_id, wom.inventory_item_id, ii.name AS item_name,
                       wom.description, wom.quantity, ii.unit, wom.unit_cost, wom.used, wom.used_at
                FROM work_order_materials wom
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE wom.tenant_id = ?
                  AND wom.work_order_id IN (%s)
                ORDER BY wom.created_at, wom.description
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> materials.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.MaterialDto(
                        rs.getObject("id", UUID.class),
                        rs.getObject("inventory_item_id", UUID.class),
                        rs.getString("item_name"),
                        rs.getString("description"),
                        rs.getBigDecimal("quantity"),
                        rs.getString("unit"),
                        rs.getBigDecimal("unit_cost"),
                        rs.getBoolean("used"),
                        instant("used_at", rs)
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return materials;
    }

    private Map<UUID, List<WorkOrderDto.AssetDto>> assetsByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var assets = new LinkedHashMap<UUID, List<WorkOrderDto.AssetDto>>();
        jdbcTemplate.query("""
                SELECT woa.work_order_id, a.id AS asset_id, a.asset_type, a.name, a.identifier
                FROM work_order_assets woa
                JOIN assets a ON a.id = woa.asset_id AND a.tenant_id = woa.tenant_id
                WHERE woa.tenant_id = ?
                  AND woa.work_order_id IN (%s)
                ORDER BY a.asset_type, a.name
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> assets.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.AssetDto(
                        rs.getObject("asset_id", UUID.class),
                        rs.getString("asset_type"),
                        rs.getString("name"),
                        rs.getString("identifier")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return assets;
    }

    private Map<UUID, List<WorkOrderDto.TaskDto>> tasksByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var tasks = new LinkedHashMap<UUID, List<WorkOrderDto.TaskDto>>();
        jdbcTemplate.query("""
                SELECT wot.id, wot.work_order_id, wot.parent_task_id, wot.assigned_worker_id, w.display_name AS assigned_worker_name,
                       wot.label, wot.sort_order, wot.checklist_phase::text AS checklist_phase,
                       wot.required, wot.completed, wot.task_status::text AS task_status, wot.notes
                FROM work_order_tasks wot
                LEFT JOIN workers w ON w.id = wot.assigned_worker_id AND w.tenant_id = wot.tenant_id
                WHERE wot.tenant_id = ?
                  AND wot.work_order_id IN (%s)
                ORDER BY wot.parent_task_id NULLS FIRST, wot.sort_order, wot.label
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> tasks.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.TaskDto(
                        rs.getObject("id", UUID.class),
                        rs.getObject("parent_task_id", UUID.class),
                        rs.getObject("assigned_worker_id", UUID.class),
                        rs.getString("assigned_worker_name"),
                        rs.getString("label"),
                        rs.getInt("sort_order"),
                        rs.getString("checklist_phase"),
                        rs.getBoolean("required"),
                        rs.getBoolean("completed"),
                        rs.getString("task_status"),
                        rs.getString("notes")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return tasks;
    }

    private void auditWorkOrderChanges(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            WorkOrderDto before,
            WorkOrderDto after
    ) {
        var fieldChanges = scalarChanges(before, after);
        var assignmentBefore = assignmentAudit(before.assignments());
        var assignmentAfter = assignmentAudit(after.assignments());
        var materialBefore = materialAudit(before.materials());
        var materialAfter = materialAudit(after.materials());
        var assetBefore = assetAudit(before.assets());
        var assetAfter = assetAudit(after.assets());
        var taskBefore = taskAudit(before.tasks());
        var taskAfter = taskAudit(after.tasks());

        var collectionNames = new ArrayList<String>();
        if (!assignmentBefore.equals(assignmentAfter)) {
            collectionNames.add("assignments");
        }
        if (!materialBefore.equals(materialAfter)) {
            collectionNames.add("materials");
        }
        if (!assetBefore.equals(assetAfter)) {
            collectionNames.add("assets");
        }
        if (!taskBefore.equals(taskAfter)) {
            collectionNames.add("tasks");
        }
        if (fieldChanges.isEmpty() && collectionNames.isEmpty()) {
            return;
        }

        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workOrderNumber", after.workOrderNumber());
        metadata.put("title", after.title());
        metadata.put("changedFields", fieldChanges.keySet());
        metadata.put("changedCollections", collectionNames);
        metadata.put("changes", fieldChanges);
        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_UPDATED", "WORK_ORDER", workOrderId, metadata);

        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_ASSIGNMENTS_UPDATED", assignmentBefore, assignmentAfter);
        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_MATERIALS_UPDATED", materialBefore, materialAfter);
        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_ASSETS_UPDATED", assetBefore, assetAfter);
        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_TASKS_UPDATED", taskBefore, taskAfter);
    }

    private void auditCollectionChange(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            WorkOrderDto workOrder,
            String action,
            List<Map<String, Object>> before,
            List<Map<String, Object>> after
    ) {
        if (before.equals(after)) {
            return;
        }
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workOrderNumber", workOrder.workOrderNumber());
        metadata.put("title", workOrder.title());
        metadata.put("before", before);
        metadata.put("after", after);
        auditWriter.record(tenantId, actorUserId, action, "WORK_ORDER", workOrderId, metadata);
    }

    private Map<String, Map<String, Object>> scalarChanges(WorkOrderDto before, WorkOrderDto after) {
        var changes = new LinkedHashMap<String, Map<String, Object>>();
        putChange(changes, "ownerId", before.ownerId(), after.ownerId());
        putChange(changes, "ownerName", before.ownerName(), after.ownerName());
        putChange(changes, "propertyId", before.propertyId(), after.propertyId());
        putChange(changes, "propertyName", before.propertyName(), after.propertyName());
        putChange(changes, "serviceTypeId", before.serviceTypeId(), after.serviceTypeId());
        putChange(changes, "serviceName", before.serviceName(), after.serviceName());
        putChange(changes, "title", before.title(), after.title());
        putChange(changes, "description", before.description(), after.description());
        putChange(changes, "status", before.status(), after.status());
        putChange(changes, "source", before.source(), after.source());
        putChange(changes, "priority", before.priority(), after.priority());
        putChange(changes, "scheduledStart", before.scheduledStart(), after.scheduledStart());
        putChange(changes, "scheduledEnd", before.scheduledEnd(), after.scheduledEnd());
        putChange(changes, "requesterName", before.requesterName(), after.requesterName());
        putChange(changes, "requesterEmail", before.requesterEmail(), after.requesterEmail());
        putChange(changes, "requesterPhone", before.requesterPhone(), after.requesterPhone());
        putChange(changes, "recurrenceRule", before.recurrenceRule(), after.recurrenceRule());
        putChange(changes, "recurrenceInterval", before.recurrenceInterval(), after.recurrenceInterval());
        putChange(changes, "recurrenceUntil", before.recurrenceUntil(), after.recurrenceUntil());
        return changes;
    }

    private void putChange(Map<String, Map<String, Object>> changes, String field, Object before, Object after) {
        if (Objects.equals(before, after)) {
            return;
        }
        var change = new LinkedHashMap<String, Object>();
        change.put("before", auditValue(before));
        change.put("after", auditValue(after));
        changes.put(field, change);
    }

    private Object auditValue(Object value) {
        return switch (value) {
            case null -> null;
            case UUID uuid -> uuid.toString();
            case Instant instant -> instant.toString();
            case LocalDate localDate -> localDate.toString();
            default -> value;
        };
    }

    private List<Map<String, Object>> assignmentAudit(List<WorkOrderDto.AssignmentDto> assignments) {
        return assignments.stream()
                .map(assignment -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("workerId", assignment.workerId().toString());
                    item.put("workerName", assignment.workerName());
                    item.put("leadWorker", assignment.leadWorker());
                    item.put("assignmentStatus", assignment.assignmentStatus());
                    item.put("assignmentRole", assignment.assignmentRole());
                    item.put("notes", assignment.notes());
                    return item;
                })
                .toList();
    }

    private List<Map<String, Object>> materialAudit(List<WorkOrderDto.MaterialDto> materials) {
        return materials.stream()
                .map(material -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("inventoryItemId", material.inventoryItemId() == null ? null : material.inventoryItemId().toString());
                    item.put("itemName", material.itemName());
                    item.put("description", material.description());
                    item.put("quantity", material.quantity());
                    item.put("unit", material.unit());
                    item.put("unitCost", material.unitCost());
                    item.put("used", material.used());
                    item.put("usedAt", material.usedAt() == null ? null : material.usedAt().toString());
                    return item;
                })
                .toList();
    }

    private List<Map<String, Object>> assetAudit(List<WorkOrderDto.AssetDto> assets) {
        return assets.stream()
                .map(asset -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("assetId", asset.assetId().toString());
                    item.put("assetType", asset.assetType());
                    item.put("name", asset.name());
                    item.put("identifier", asset.identifier());
                    return item;
                })
                .toList();
    }

    private List<Map<String, Object>> taskAudit(List<WorkOrderDto.TaskDto> tasks) {
        return tasks.stream()
                .map(task -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("taskId", task.id().toString());
                    item.put("parentTaskId", task.parentTaskId() == null ? null : task.parentTaskId().toString());
                    item.put("assignedWorkerId", task.assignedWorkerId() == null ? null : task.assignedWorkerId().toString());
                    item.put("assignedWorkerName", task.assignedWorkerName());
                    item.put("label", task.label());
                    item.put("sortOrder", task.sortOrder());
                    item.put("phase", task.phase());
                    item.put("required", task.required());
                    item.put("completed", task.completed());
                    item.put("taskStatus", task.taskStatus());
                    item.put("notes", task.notes());
                    return item;
                })
                .toList();
    }

    private Instant instant(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private record WorkOrderListFilters(String statusFilter, String dateFilter, LocalDate customFrom, LocalDate customTo) {
        private static WorkOrderListFilters all() {
            return new WorkOrderListFilters("ALL", "ALL", null, null);
        }

        private static WorkOrderListFilters of(String statusFilter, String dateFilter, LocalDate customFrom, LocalDate customTo) {
            return new WorkOrderListFilters(normalizedFilter(statusFilter), normalizedFilter(dateFilter), customFrom, customTo);
        }

        private static String normalizedFilter(String value) {
            return value == null || value.isBlank() ? "ALL" : value.trim().toUpperCase(Locale.ROOT);
        }
    }

    private record WorkOrderRow(
            UUID id,
            String workOrderNumber,
            UUID ownerId,
            String ownerName,
            UUID propertyId,
            String propertyName,
            String propertyAddress,
            UUID serviceTypeId,
            String serviceName,
            String title,
            String description,
            String status,
            String source,
            String priority,
            Instant scheduledStart,
            Instant scheduledEnd,
            String requesterName,
            String requesterEmail,
            String requesterPhone,
            String recurrenceRule,
            Integer recurrenceInterval,
            LocalDate recurrenceUntil
    ) {
    }

    private record PropertyRef(UUID propertyId, UUID ownerId) {
    }

    private record InventoryItemRef(String name) {
    }

    private record InvoiceLineDraft(String description, BigDecimal quantity, BigDecimal unitPrice, BigDecimal lineTotal, String sourceType) {
        private boolean serviceLine() {
            return "SERVICE".equals(sourceType);
        }

        private boolean materialLine() {
            return "MATERIAL".equals(sourceType);
        }
    }

    private Set<UUID> assignedWorkerIds(CreateWorkOrderRequest request) {
        var workerIds = new LinkedHashSet<UUID>();
        if (request.assignedWorkerId() != null) {
            workerIds.add(request.assignedWorkerId());
        }
        if (request.assignedWorkerIds() != null) {
            workerIds.addAll(request.assignedWorkerIds().stream().filter(java.util.Objects::nonNull).toList());
        }
        return workerIds;
    }

    private void replaceAssignments(UUID tenantId, UUID workOrderId, UUID actorUserId, CreateWorkOrderRequest request, Set<UUID> assignedWorkerIds) {
        jdbcTemplate.update("""
                DELETE FROM work_order_assignments
                WHERE tenant_id = ? AND work_order_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, tenantId, workOrderId);
        var leadWorkerId = leadWorkerId(request, assignedWorkerIds);
        for (var workerId : assignedWorkerIds) {
            jdbcTemplate.update("""
                    INSERT INTO work_order_assignments (tenant_id, work_order_id, worker_id, lead_worker, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT (tenant_id, work_order_id, worker_id)
                    DO UPDATE SET lead_worker = excluded.lead_worker,
                                  assignment_status = 'ASSIGNED'::work_order_assignment_status,
                                  released_at = NULL,
                                  release_reason = NULL,
                                  updated_by = excluded.updated_by,
                                  updated_at = now()
                    """, tenantId, workOrderId, workerId, workerId.equals(leadWorkerId), actorUserId, actorUserId);
        }
    }

    private void replaceMaterials(UUID tenantId, UUID workOrderId, UUID actorUserId, List<CreateWorkOrderRequest.MaterialRequest> materials) {
        var existingMaterialIds = new LinkedHashSet<>(jdbcTemplate.queryForList(
                "SELECT id FROM work_order_materials WHERE tenant_id = ? AND work_order_id = ?",
                UUID.class,
                tenantId,
                workOrderId
        ));
        var retainedMaterialIds = new LinkedHashSet<UUID>();
        if (materials == null) {
            jdbcTemplate.update("DELETE FROM work_order_materials WHERE tenant_id = ? AND work_order_id = ?", tenantId, workOrderId);
            return;
        }
        for (var material : materials) {
            if (material == null || material.quantity() == null || material.quantity().signum() <= 0) {
                continue;
            }
            var item = inventoryItem(tenantId, material.inventoryItemId());
            var description = blankToNull(material.description());
            if (description == null && item == null) {
                throw new BadRequestException("Material description is required when no inventory item is selected.");
            }
            if (material.id() != null && existingMaterialIds.contains(material.id())) {
                jdbcTemplate.update("""
                        UPDATE work_order_materials
                        SET inventory_item_id = ?, description = ?, quantity = ?, unit_cost = ?, updated_by = ?, updated_at = now()
                        WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                        """,
                        material.inventoryItemId(),
                        description == null ? item.name() : description,
                        material.quantity(),
                        material.unitCost(),
                        actorUserId,
                        tenantId,
                        workOrderId,
                        material.id()
                );
                retainedMaterialIds.add(material.id());
                continue;
            }
            var materialId = jdbcTemplate.queryForObject("""
                    INSERT INTO work_order_materials (
                        tenant_id, work_order_id, inventory_item_id, description, quantity, unit_cost, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """,
                    UUID.class,
                    tenantId,
                    workOrderId,
                    material.inventoryItemId(),
                    description == null ? item.name() : description,
                    material.quantity(),
                    material.unitCost(),
                    actorUserId,
                    actorUserId
            );
            retainedMaterialIds.add(materialId);
        }
        for (var existingMaterialId : existingMaterialIds) {
            if (!retainedMaterialIds.contains(existingMaterialId)) {
                jdbcTemplate.update("DELETE FROM work_order_materials WHERE tenant_id = ? AND work_order_id = ? AND id = ?", tenantId, workOrderId, existingMaterialId);
            }
        }
    }

    private void replaceTasks(UUID tenantId, UUID workOrderId, UUID actorUserId, CreateWorkOrderRequest request, Set<UUID> assignedWorkerIds) {
        var tasks = normalizedTasks(request, false);
        var existingTaskIds = new LinkedHashSet<>(jdbcTemplate.queryForList(
                "SELECT id FROM work_order_tasks WHERE tenant_id = ? AND work_order_id = ?",
                UUID.class,
                tenantId,
                workOrderId
        ));
        var retainedTaskIds = new LinkedHashSet<UUID>();
        var retainedTaskIdsByIndex = new ArrayList<UUID>();
        for (var index = 0; index < tasks.size(); index++) {
            var task = tasks.get(index);
            if (task.assignedWorkerId() != null && !assignedWorkerIds.contains(task.assignedWorkerId())) {
                throw new BadRequestException("Task assignee must also be assigned to the work order.");
            }
            var parentTaskId = task.parentIndex() == null || task.parentIndex() < 0 || task.parentIndex() >= retainedTaskIdsByIndex.size()
                    ? null
                    : retainedTaskIdsByIndex.get(task.parentIndex());
            UUID taskId;
            if (task.id() != null && existingTaskIds.contains(task.id())) {
                jdbcTemplate.update("""
                        UPDATE work_order_tasks
                        SET parent_task_id = ?, assigned_worker_id = ?, label = ?, sort_order = ?,
                            checklist_phase = ?::work_order_task_phase, required = ?, notes = ?, updated_by = ?, updated_at = now()
                        WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                        """,
                        parentTaskId,
                        task.assignedWorkerId(),
                        task.label().trim(),
                        index + 1,
                        task.phase(),
                        task.required(),
                        blankToNull(task.notes()),
                        actorUserId,
                        tenantId,
                        workOrderId,
                        task.id()
                );
                taskId = task.id();
            } else {
                taskId = jdbcTemplate.queryForObject("""
                    INSERT INTO work_order_tasks (
                        tenant_id, work_order_id, parent_task_id, assigned_worker_id, label, sort_order,
                        checklist_phase, required, task_status, notes, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?::work_order_task_phase, ?, 'TO_DO', ?, ?, ?)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    workOrderId,
                    parentTaskId,
                    task.assignedWorkerId(),
                    task.label().trim(),
                    index + 1,
                    task.phase(),
                    task.required(),
                    blankToNull(task.notes()),
                    actorUserId,
                    actorUserId
                );
            }
            retainedTaskIds.add(taskId);
            retainedTaskIdsByIndex.add(taskId);
        }
        for (var existingTaskId : existingTaskIds) {
            if (!retainedTaskIds.contains(existingTaskId)) {
                jdbcTemplate.update("DELETE FROM work_order_tasks WHERE tenant_id = ? AND work_order_id = ? AND id = ?", tenantId, workOrderId, existingTaskId);
            }
        }
    }

    private void replaceAssets(UUID tenantId, UUID workOrderId, UUID actorUserId, List<UUID> assetIds) {
        jdbcTemplate.update("DELETE FROM work_order_assets WHERE tenant_id = ? AND work_order_id = ?", tenantId, workOrderId);
        if (assetIds == null) {
            return;
        }
        for (var assetId : new LinkedHashSet<>(assetIds)) {
            if (assetId == null) {
                continue;
            }
            requireTenantAsset(tenantId, assetId);
            jdbcTemplate.update("""
                    INSERT INTO work_order_assets (tenant_id, work_order_id, asset_id, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                    """, tenantId, workOrderId, assetId, actorUserId, actorUserId);
        }
    }

    private InventoryItemRef inventoryItem(UUID tenantId, UUID inventoryItemId) {
        if (inventoryItemId == null) {
            return null;
        }
        return jdbcTemplate.query("""
                SELECT name
                FROM inventory_items
                WHERE tenant_id = ? AND id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new BadRequestException("Inventory item is not available for this tenant.");
            }
            return new InventoryItemRef(rs.getString("name"));
        }, tenantId, inventoryItemId);
    }

    private void requireTenantAsset(UUID tenantId, UUID assetId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM assets WHERE tenant_id = ? AND id = ? AND active = true)",
                Boolean.class,
                tenantId,
                assetId
        ));
        if (!exists) {
            throw new BadRequestException("Equipment is not available for this tenant.");
        }
    }

    private UUID leadWorkerId(CreateWorkOrderRequest request, Set<UUID> assignedWorkerIds) {
        if (request.leadWorkerId() != null && assignedWorkerIds.contains(request.leadWorkerId())) {
            return request.leadWorkerId();
        }
        return assignedWorkerIds.stream().findFirst().orElse(null);
    }

    private String source(String source) {
        return source == null || source.isBlank() ? "TENANT_PORTAL" : source;
    }

    private String status(String requestedStatus, String source, Set<UUID> assignedWorkerIds, Instant scheduledStart) {
        if (requestedStatus != null && !requestedStatus.isBlank()) {
            return requestedStatus;
        }
        if ("WEBSITE".equals(source) || "CUSTOMER_PORTAL".equals(source)) {
            return "PENDING";
        }
        if (!assignedWorkerIds.isEmpty() || scheduledStart != null) {
            return "TO_DO";
        }
        return "TO_DO";
    }

    private List<NormalizedTask> normalizedTasks(CreateWorkOrderRequest request, boolean useDefaultsWhenEmpty) {
        if (request.taskItems() != null && !request.taskItems().isEmpty()) {
            return request.taskItems().stream()
                    .filter(task -> task != null && task.label() != null && !task.label().isBlank())
                    .map(task -> new NormalizedTask(
                            task.id(),
                            task.label(),
                            task.parentIndex(),
                            task.assignedWorkerId(),
                            taskPhase(task.phase()),
                            task.required() == null || task.required(),
                            task.notes()
                    ))
                    .toList();
        }
        if (request.tasks() == null || request.tasks().isEmpty()) {
            return useDefaultsWhenEmpty
                    ? defaultTasks()
                    : List.of();
        }
        return request.tasks().stream()
                .filter(label -> label != null && !label.isBlank())
                .map(label -> new NormalizedTask(null, label, null, null, "COMPLETION", true, null))
                .toList();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String normalizeReviewAction(String action) {
        if (action == null || action.isBlank()) {
            throw new BadRequestException("Review action is required.");
        }
        var normalized = action.trim().toUpperCase();
        if (!Set.of("APPROVE", "APPROVE_AND_INVOICE", "SEND_BACK", "OVERRIDE_COMPLETE").contains(normalized)) {
            throw new BadRequestException("Review action is not supported.");
        }
        return normalized;
    }

    private Map<String, Object> metadata(String value) {
        try {
            return objectMapper.readValue(value == null ? "{}" : value, METADATA_TYPE);
        } catch (Exception exception) {
            return Map.of("raw", value == null ? "{}" : value);
        }
    }

    private boolean isLockedForGeneralUpdate(String status) {
        return Set.of("PENDING_COMPLETION", "COMPLETED", "APPROVED", "INVOICED", "PAID").contains(status);
    }

    private List<NormalizedTask> defaultTasks() {
        var tasks = new ArrayList<NormalizedTask>();
        DEFAULT_PRE_START_CHECKS.forEach(label -> tasks.add(new NormalizedTask(null, label, null, null, "PRE_START", true, null)));
        DEFAULT_COMPLETION_CHECKS.forEach(label -> tasks.add(new NormalizedTask(null, label, null, null, "COMPLETION", true, null)));
        return tasks;
    }

    private String taskPhase(String phase) {
        if (phase == null || phase.isBlank()) {
            return "COMPLETION";
        }
        var normalized = phase.trim().toUpperCase();
        if (!Set.of("PRE_START", "COMPLETION").contains(normalized)) {
            throw new BadRequestException("Checklist phase is not supported.");
        }
        return normalized;
    }

    private record NormalizedTask(UUID id, String label, Integer parentIndex, UUID assignedWorkerId, String phase, boolean required, String notes) {
    }
}
