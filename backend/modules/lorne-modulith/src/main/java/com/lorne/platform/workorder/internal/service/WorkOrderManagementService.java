package com.lorne.platform.workorder.internal.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.notification.OwnerNotificationOperations;
import com.lorne.platform.notification.WorkOrderCompletionEmail;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.workorder.internal.dto.CancelWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.SendWorkOrderOwnerEmailRequest;
import com.lorne.platform.workorder.internal.dto.WorkerAvailabilityDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderEvidenceActionRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderFieldOverrideRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderMaintenanceRecordDto;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkOrderManagementService {
    private static final TypeReference<Map<String, Object>> METADATA_TYPE = new TypeReference<>() {
    };
    private static final Map<String, Object> EMPTY_MAINTENANCE_RECORD_TEMPLATE = Map.of(
            "enabled", false,
            "title", "Maintenance record",
            "callTypes", List.of(),
            "checks", List.of(),
            "measurements", List.of(),
            "chemicals", List.of(),
            "deliveries", List.of(),
            "noteLabel", "Client note"
    );
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
    private static final Set<String> WORK_ORDER_TYPES = Set.of("SERVICE", "PICKUP_DELIVERY", "INSPECTION", "FOLLOW_UP");
    private static final Set<String> WORK_ORDER_ASSIGNMENT_STATUSES = Set.of(
            "ASSIGNED", "ACCEPTED", "ON_SITE", "DECLINED", "IN_PROGRESS", "PAUSED", "LEFT_EMERGENCY", "COMPLETED", "RELEASED"
    );
    private static final Set<String> WORK_ORDER_TASK_STATUSES = Set.of(
            "TO_DO", "IN_PROGRESS", "ON_HOLD", "PENDING_COMPLETION", "COMPLETED", "CANCELLED"
    );
    private static final Set<String> WORKER_ACTIVITY_TYPES = Set.of(
            "OFFICE", "SUPPLIER", "SHOP", "WAREHOUSE", "TRAVEL", "BREAK", "OTHER"
    );

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final WorkOrderNumberGenerator workOrderNumberGenerator;
    private final OwnerNotificationOperations ownerNotificationOperations;
    private final DocumentStorageService documentStorageService;
    private final ObjectMapper objectMapper;
    private final WorkOrderTravelEstimateUpdater travelEstimateUpdater;
    private final TenantSettingsOperations tenantSettingsOperations;

    public WorkOrderManagementService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            WorkOrderNumberGenerator workOrderNumberGenerator,
            OwnerNotificationOperations ownerNotificationOperations,
            DocumentStorageService documentStorageService,
            ObjectMapper objectMapper,
            WorkOrderTravelEstimateUpdater travelEstimateUpdater,
            TenantSettingsOperations tenantSettingsOperations
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.workOrderNumberGenerator = workOrderNumberGenerator;
        this.ownerNotificationOperations = ownerNotificationOperations;
        this.documentStorageService = documentStorageService;
        this.objectMapper = objectMapper;
        this.travelEstimateUpdater = travelEstimateUpdater;
        this.tenantSettingsOperations = tenantSettingsOperations;
    }

    @Transactional(readOnly = true)
    public List<WorkOrderDto> list(UUID tenantId) {
        return workOrders(tenantId, null);
    }

    @Transactional(readOnly = true)
    public void requireWorkOrderExists(UUID tenantId, UUID workOrderId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_orders
                    WHERE tenant_id = ? AND id = ?
                )
                """, Boolean.class, tenantId, workOrderId));
        if (!exists) {
            throw new ResourceNotFoundException("Work order not found.");
        }
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
        var workOrderType = workOrderType(request.workOrderType());
        validatePickupRouteStops(workOrderType, request.routeStops());
        var status = status(request.status(), source, assignedWorkerIds, request.scheduledStart());
        var priority = request.priority() == null || request.priority().isBlank() ? "NORMAL" : request.priority();
        var workOrderNumber = workOrderNumberGenerator.nextNumber();
        var workOrderId = jdbcTemplate.queryForObject("""
                INSERT INTO work_orders (
                    tenant_id, work_order_number, work_order_type, customer_id, property_id, service_type_id, title, description, status, priority,
                    scheduled_start, scheduled_end, source, requester_name, requester_email, requester_phone, requested_at,
                    recurrence_rule, recurrence_interval, recurrence_until, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::work_order_status, ?::work_order_priority, ?, ?, ?::work_order_source, ?, ?, ?, now(), ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                workOrderNumber,
                workOrderType,
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
        replaceRouteStops(tenantId, workOrderId, actorUserId, request.routeStops());
        replaceWorkOrderLinks(tenantId, workOrderId, actorUserId, request.linkedWorkOrders());
        travelEstimateUpdater.refresh(tenantId, workOrderId);

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
        auditMetadata.put("workOrderType", workOrderType);
        auditMetadata.put("priority", priority);
        auditMetadata.put("assignedWorkerCount", assignedWorkerIds.size());
        auditMetadata.put("availabilityOverride", allowAvailabilityOverride);
        if (allowAvailabilityOverride) {
            auditMetadata.put("availabilityOverrideReason", blankToNull(request.allowAvailabilityOverrideReason()));
        }
        auditMetadata.put("materialCount", request.materials() == null ? 0 : request.materials().size());
        auditMetadata.put("assetCount", request.assetIds() == null ? 0 : request.assetIds().size());
        auditMetadata.put("taskCount", tasks.size());
        auditMetadata.put("routeStopCount", request.routeStops() == null ? 0 : request.routeStops().size());
        auditMetadata.put("linkedWorkOrderCount", request.linkedWorkOrders() == null ? 0 : request.linkedWorkOrders().size());
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
        var workOrderType = workOrderType(request.workOrderType());
        validatePickupRouteStops(workOrderType, request.routeStops());
        var status = status(request.status(), source, assignedWorkerIds, request.scheduledStart());
        var priority = request.priority() == null || request.priority().isBlank() ? "NORMAL" : request.priority();
        jdbcTemplate.update("""
                UPDATE work_orders
                SET customer_id = ?, property_id = ?, service_type_id = ?, work_order_type = ?, title = ?, description = ?,
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
                workOrderType,
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
        replaceRouteStops(tenantId, workOrderId, actorUserId, request.routeStops());
        replaceWorkOrderLinks(tenantId, workOrderId, actorUserId, request.linkedWorkOrders());
        replaceTasks(tenantId, workOrderId, actorUserId, request, assignedWorkerIds);
        travelEstimateUpdater.refresh(tenantId, workOrderId);

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
                maintenanceRecords(tenantId, workOrderId),
                evidence(tenantId, workOrderId),
                workerActivities(tenantId, workOrder),
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
    public WorkOrderReviewDto reviewAction(
            UUID tenantId,
            UUID actorUserId,
            List<String> actorRoles,
            UUID workOrderId,
            WorkOrderReviewActionRequest request
    ) {
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
        if (approveAndInvoice && !canManageBilling(actorRoles)) {
            throw new AccessDeniedException("Only tenant admins or finance users can generate invoices.");
        }
        if ("APPROVE".equals(action) || approveAndInvoice) {
            requireLinkedDependenciesComplete(tenantId, workOrderId);
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
            if (tenantSettingsOperations.settings(tenantId).autoSendWorkCompletedEmail()) {
                var delivery = ownerNotificationOperations.sendWorkOrderCompleted(
                        tenantId,
                        actorUserId,
                        completionEmail(tenantId, workOrderId, note, null, null, null, "AUTO")
                );
                if ("SENT".equals(delivery.status())) {
                    jdbcTemplate.update("""
                            UPDATE work_orders
                            SET status = 'CUSTOMER_NOTIFIED'::work_order_status, updated_by = ?, updated_at = now()
                            WHERE tenant_id = ? AND id = ? AND status = 'APPROVED'
                            """, actorUserId, tenantId, workOrderId);
                    auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CUSTOMER_NOTIFIED", "WORK_ORDER", workOrderId, Map.of(
                            "workOrderNumber", before.workOrderNumber(),
                            "recipientEmail", delivery.recipientEmail(),
                            "deliveryStatus", delivery.status(),
                            "deliveryMode", "AUTO"
                    ));
                }
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

    private boolean canManageBilling(List<String> roles) {
        return roles != null && roles.stream().anyMatch(role -> "TENANT_ADMIN".equals(role) || "FINANCE".equals(role));
    }

    @Transactional
    public WorkOrderReviewDto evidenceAction(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderEvidenceActionRequest request) {
        requireWorkOrderExists(tenantId, workOrderId);
        var action = normalizeEvidenceAction(request.action());
        documentStorageService.requireWorkOrderDocument(tenantId, workOrderId, request.documentId());
        if ("ADD_PHOTO".equals(action)) {
            recordAdminPhoto(tenantId, actorUserId, workOrderId, request);
        } else {
            recordAdminPurchaseReceipt(tenantId, actorUserId, workOrderId, request);
        }
        return review(tenantId, actorUserId, workOrderId);
    }

    private void recordAdminPhoto(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderEvidenceActionRequest request) {
        var photoType = normalizePhotoType(request.photoType());
        var caption = requiredCaption(request.caption());
        var capturedAt = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO work_order_photos (
                    tenant_id, work_order_id, document_id, photo_type, caption, captured_at, created_by, updated_by
                )
                VALUES (?, ?, ?, ?::work_order_photo_type, ?, ?, ?, ?)
                """,
                tenantId,
                workOrderId,
                request.documentId(),
                photoType,
                caption,
                timestamp(capturedAt),
                actorUserId,
                actorUserId
        );
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("documentId", request.documentId());
        metadata.put("photoType", photoType);
        metadata.put("caption", caption);
        metadata.put("actionAt", capturedAt);
        auditWriter.record(tenantId, actorUserId, "ADMIN_WORK_PHOTO_UPLOADED", "WORK_ORDER", workOrderId, metadata);
    }

    private void recordAdminPurchaseReceipt(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderEvidenceActionRequest request) {
        var caption = requiredCaption(request.caption());
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("documentId", request.documentId());
        metadata.put("caption", caption);
        metadata.put("vendorName", blankToNull(request.vendorName()) == null ? "" : request.vendorName().trim());
        metadata.put("receiptAmount", request.receiptAmount() == null ? BigDecimal.ZERO : request.receiptAmount());
        metadata.put("actionAt", Instant.now());
        auditWriter.record(tenantId, actorUserId, "ADMIN_PURCHASE_RECEIPT_UPLOADED", "WORK_ORDER", workOrderId, metadata);
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
    public WorkOrderReviewDto fieldOverride(UUID tenantId, UUID actorUserId, UUID workOrderId, WorkOrderFieldOverrideRequest request) {
        var reason = blankToNull(request.reason());
        if (reason == null) {
            throw new BadRequestException("Override reason is required.");
        }
        var workOrder = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));

        var assignmentCount = applyAssignmentOverrides(tenantId, actorUserId, workOrderId, reason, nullToEmpty(request.assignments()));
        var activityCount = applyWorkerActivityOverrides(tenantId, actorUserId, workOrderId, nullToEmpty(request.workerActivities()));
        var taskCount = applyTaskOverrides(tenantId, actorUserId, workOrderId, nullToEmpty(request.tasks()));
        var routeStopCount = applyRouteStopOverrides(tenantId, actorUserId, workOrderId, nullToEmpty(request.routeStops()));
        var materialCount = applyMaterialOverrides(tenantId, actorUserId, workOrderId, nullToEmpty(request.materials()));
        var noteCount = applyFieldNoteOverrides(tenantId, actorUserId, workOrderId, nullToEmpty(request.fieldNotes()));

        if (assignmentCount + activityCount + taskCount + routeStopCount + materialCount + noteCount == 0) {
            throw new BadRequestException("No override changes were provided.");
        }
        if (routeStopCount > 0) {
            travelEstimateUpdater.refresh(tenantId, workOrderId);
        }

        auditWriter.record(tenantId, actorUserId, "WORK_ORDER_FIELD_OVERRIDE_APPLIED", "WORK_ORDER", workOrderId, Map.of(
                "workOrderNumber", workOrder.workOrderNumber(),
                "title", workOrder.title(),
                "reason", reason,
                "assignmentChanges", assignmentCount,
                "activityChanges", activityCount,
                "taskChanges", taskCount,
                "routeStopChanges", routeStopCount,
                "materialChanges", materialCount,
                "fieldNoteChanges", noteCount
        ));
        return review(tenantId, actorUserId, workOrderId);
    }

    private int applyAssignmentOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            String reason,
            List<WorkOrderFieldOverrideRequest.AssignmentOverride> assignments
    ) {
        var count = 0;
        for (var assignment : assignments) {
            if (assignment.workerId() == null) {
                continue;
            }
            requireAssignedWorker(tenantId, workOrderId, assignment.workerId());
            var status = normalizedEnum(assignment.assignmentStatus(), WORK_ORDER_ASSIGNMENT_STATUSES, "assignment status");
            var minutes = correctedMinutes(assignment.actualArrivedAt(), assignment.actualWorkStartedAt(), assignment.actualFinishedAt(), assignment.actualWorkMinutes());
            if (status != null || assignment.leadWorker() != null || assignment.notes() != null) {
                jdbcTemplate.update("""
                        UPDATE work_order_assignments
                        SET assignment_status = COALESCE(?::work_order_assignment_status, assignment_status),
                            lead_worker = COALESCE(?::boolean, lead_worker),
                            notes = COALESCE(?::text, notes),
                            updated_by = ?,
                            updated_at = now()
                        WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ?
                        """,
                        status,
                        assignment.leadWorker(),
                        blankToNull(assignment.notes()),
                        actorUserId,
                        tenantId,
                        workOrderId,
                        assignment.workerId()
                );
            }
            if (status != null || assignment.actualArrivedAt() != null || assignment.actualWorkStartedAt() != null
                    || assignment.actualFinishedAt() != null || minutes != null) {
                jdbcTemplate.update("""
                        INSERT INTO work_order_assignment_overrides (
                            tenant_id, work_order_id, worker_id, assignment_status, actual_arrived_at,
                            actual_work_started_at, actual_finished_at, actual_work_minutes, reason, created_by, updated_by
                        )
                        VALUES (?, ?, ?, ?::work_order_assignment_status, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT (tenant_id, work_order_id, worker_id)
                        DO UPDATE SET
                            assignment_status = COALESCE(EXCLUDED.assignment_status, work_order_assignment_overrides.assignment_status),
                            actual_arrived_at = COALESCE(EXCLUDED.actual_arrived_at, work_order_assignment_overrides.actual_arrived_at),
                            actual_work_started_at = COALESCE(EXCLUDED.actual_work_started_at, work_order_assignment_overrides.actual_work_started_at),
                            actual_finished_at = COALESCE(EXCLUDED.actual_finished_at, work_order_assignment_overrides.actual_finished_at),
                            actual_work_minutes = COALESCE(EXCLUDED.actual_work_minutes, work_order_assignment_overrides.actual_work_minutes),
                            reason = EXCLUDED.reason,
                            updated_by = EXCLUDED.updated_by,
                            updated_at = now()
                        """,
                        tenantId,
                        workOrderId,
                        assignment.workerId(),
                        status,
                        timestamp(assignment.actualArrivedAt()),
                        timestamp(assignment.actualWorkStartedAt()),
                        timestamp(assignment.actualFinishedAt()),
                        minutes,
                        reason,
                        actorUserId,
                        actorUserId
                );
            }
            count++;
        }
        return count;
    }

    private int applyWorkerActivityOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            List<WorkOrderFieldOverrideRequest.WorkerActivityOverride> activities
    ) {
        var count = 0;
        for (var activity : activities) {
            if (activity.activityId() == null) {
                count += insertWorkerActivityOverride(tenantId, actorUserId, workOrderId, activity);
                continue;
            }
            if (Boolean.TRUE.equals(activity.delete())) {
                count += jdbcTemplate.update("""
                        DELETE FROM worker_daily_activities
                        WHERE tenant_id = ? AND id = ?
                          AND EXISTS (
                              SELECT 1
                              FROM work_order_assignments woa
                              WHERE woa.tenant_id = worker_daily_activities.tenant_id
                                AND woa.worker_id = worker_daily_activities.worker_id
                                AND woa.work_order_id = ?
                          )
                        """, tenantId, activity.activityId(), workOrderId);
                continue;
            }
            if (activity.workerId() == null) {
                continue;
            }
            requireAssignedWorker(tenantId, workOrderId, activity.workerId());
            var title = blankToNull(activity.title());
            if (title == null) {
                continue;
            }
            var startedAt = activity.startedAt();
            if (startedAt == null) {
                throw new BadRequestException("Worker activity start time is required.");
            }
            var endedAt = activity.endedAt();
            if (endedAt != null && !endedAt.isAfter(startedAt)) {
                throw new BadRequestException("Worker activity end time must be after the start time.");
            }
            var activityDate = startedAt.atZone(tenantZoneId(tenantId)).toLocalDate();
            count += jdbcTemplate.update("""
                    UPDATE worker_daily_activities
                    SET worker_id = ?,
                        activity_date = ?,
                        activity_type = ?,
                        title = ?,
                        location_name = ?,
                        address = ?,
                        notes = ?,
                        started_at = ?::timestamptz,
                        ended_at = ?::timestamptz,
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND id = ?
                    """,
                    activity.workerId(),
                    activityDate,
                    workerActivityType(activity.activityType()),
                    title,
                    blankToNull(activity.locationName()),
                    blankToNull(activity.address()),
                    blankToNull(activity.notes()),
                    timestamp(startedAt),
                    timestamp(endedAt),
                    actorUserId,
                    tenantId,
                    activity.activityId()
            );
        }
        return count;
    }

    private int insertWorkerActivityOverride(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            WorkOrderFieldOverrideRequest.WorkerActivityOverride activity
    ) {
        if (activity.workerId() == null) {
            return 0;
        }
        requireAssignedWorker(tenantId, workOrderId, activity.workerId());
        var title = blankToNull(activity.title());
        if (title == null) {
            return 0;
        }
        if (activity.startedAt() == null) {
            throw new BadRequestException("Worker activity start time is required.");
        }
        if (activity.endedAt() != null && !activity.endedAt().isAfter(activity.startedAt())) {
            throw new BadRequestException("Worker activity end time must be after the start time.");
        }
        var activityDate = activity.startedAt().atZone(tenantZoneId(tenantId)).toLocalDate();
        jdbcTemplate.update("""
                INSERT INTO worker_daily_activities (
                    tenant_id, worker_id, activity_date, activity_type, title, location_name,
                    address, notes, started_at, ended_at, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?::timestamptz, ?, ?)
                """,
                tenantId,
                activity.workerId(),
                activityDate,
                workerActivityType(activity.activityType()),
                title,
                blankToNull(activity.locationName()),
                blankToNull(activity.address()),
                blankToNull(activity.notes()),
                timestamp(activity.startedAt()),
                timestamp(activity.endedAt()),
                actorUserId,
                actorUserId
        );
        return 1;
    }

    private int applyTaskOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            List<WorkOrderFieldOverrideRequest.TaskOverride> tasks
    ) {
        var count = 0;
        for (var task : tasks) {
            if (task.taskId() == null) {
                continue;
            }
            var status = normalizedEnum(task.taskStatus(), WORK_ORDER_TASK_STATUSES, "task status");
            var completed = task.completed();
            var completedAt = completed == null ? task.completedAt() : Boolean.TRUE.equals(completed) ? Objects.requireNonNullElse(task.completedAt(), Instant.now()) : null;
            var updated = jdbcTemplate.update("""
                    UPDATE work_order_tasks
                    SET completed = COALESCE(?::boolean, completed),
                        completed_at = CASE
                            WHEN ?::boolean IS TRUE THEN COALESCE(?::timestamptz, completed_at, now())
                            WHEN ?::boolean IS FALSE THEN NULL
                            ELSE COALESCE(?::timestamptz, completed_at)
                        END,
                        completed_by = CASE
                            WHEN ?::boolean IS TRUE THEN COALESCE(completed_by, ?)
                            WHEN ?::boolean IS FALSE THEN NULL
                            ELSE completed_by
                        END,
                        task_status = COALESCE(?::work_order_task_status, task_status),
                        notes = COALESCE(?::text, notes),
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                    """,
                    completed,
                    completed,
                    timestamp(completedAt),
                    completed,
                    timestamp(completedAt),
                    completed,
                    actorUserId,
                    completed,
                    status,
                    blankToNull(task.notes()),
                    actorUserId,
                    tenantId,
                    workOrderId,
                    task.taskId()
            );
            count += updated;
        }
        return count;
    }

    private int applyRouteStopOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            List<WorkOrderFieldOverrideRequest.RouteStopOverride> routeStops
    ) {
        var count = 0;
        for (var routeStop : routeStops) {
            if (routeStop.routeStopId() == null) {
                count += addOverrideRouteStop(tenantId, actorUserId, workOrderId, routeStop);
                continue;
            }
            if (Boolean.TRUE.equals(routeStop.delete())) {
                count += jdbcTemplate.update("""
                        DELETE FROM work_order_route_stops
                        WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                        """, tenantId, workOrderId, routeStop.routeStopId());
                continue;
            }
            var updated = jdbcTemplate.update("""
                    UPDATE work_order_route_stops
                    SET stop_type = COALESCE(?::text, stop_type),
                        name = COALESCE(?::text, name),
                        address = COALESCE(?::text, address),
                        instructions = COALESCE(?::text, instructions),
                        planned_arrival = COALESCE(?::timestamptz, planned_arrival),
                        visible_to_worker = COALESCE(?::boolean, visible_to_worker),
                        arrived_at = COALESCE(?::timestamptz, arrived_at),
                        arrived_by = CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE arrived_by END,
                        completed_at = COALESCE(?::timestamptz, completed_at),
                        completed_by = CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE completed_by END,
                        skipped_at = COALESCE(?::timestamptz, skipped_at),
                        skipped_by = CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE skipped_by END,
                        skipped_reason = COALESCE(?::text, skipped_reason),
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                    """,
                    blankToNull(routeStop.stopType()) == null ? null : routeStopType(routeStop.stopType()),
                    blankToNull(routeStop.name()),
                    blankToNull(routeStop.address()),
                    blankToNull(routeStop.instructions()),
                    timestamp(routeStop.plannedArrival()),
                    routeStop.visibleToWorker(),
                    timestamp(routeStop.arrivedAt()),
                    timestamp(routeStop.arrivedAt()),
                    actorUserId,
                    timestamp(routeStop.completedAt()),
                    timestamp(routeStop.completedAt()),
                    actorUserId,
                    timestamp(routeStop.skippedAt()),
                    timestamp(routeStop.skippedAt()),
                    actorUserId,
                    blankToNull(routeStop.skippedReason()),
                    actorUserId,
                    tenantId,
                    workOrderId,
                    routeStop.routeStopId()
            );
            count += updated;
        }
        return count;
    }

    private int addOverrideRouteStop(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            WorkOrderFieldOverrideRequest.RouteStopOverride routeStop
    ) {
        var name = blankToNull(routeStop.name());
        if (name == null) {
            return 0;
        }
        var stopOrder = jdbcTemplate.queryForObject("""
                SELECT COALESCE(MAX(stop_order), 0) + 1
                FROM work_order_route_stops
                WHERE tenant_id = ? AND work_order_id = ?
                """, Integer.class, tenantId, workOrderId);
        jdbcTemplate.update("""
                INSERT INTO work_order_route_stops (
                    tenant_id, work_order_id, stop_order, stop_type, name, address, instructions,
                    planned_arrival, visible_to_worker, arrived_at, arrived_by, completed_at, completed_by,
                    skipped_at, skipped_by, skipped_reason, created_by, updated_by
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE NULL END,
                    ?, CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE NULL END,
                    ?, CASE WHEN ?::timestamptz IS NOT NULL THEN ? ELSE NULL END,
                    ?, ?, ?
                )
                """,
                tenantId,
                workOrderId,
                stopOrder,
                routeStopType(routeStop.stopType()),
                name,
                blankToNull(routeStop.address()),
                blankToNull(routeStop.instructions()),
                timestamp(routeStop.plannedArrival()),
                routeStop.visibleToWorker() == null || routeStop.visibleToWorker(),
                timestamp(routeStop.arrivedAt()),
                timestamp(routeStop.arrivedAt()),
                actorUserId,
                timestamp(routeStop.completedAt()),
                timestamp(routeStop.completedAt()),
                actorUserId,
                timestamp(routeStop.skippedAt()),
                timestamp(routeStop.skippedAt()),
                actorUserId,
                blankToNull(routeStop.skippedReason()),
                actorUserId,
                actorUserId
        );
        return 1;
    }

    private int applyMaterialOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            List<WorkOrderFieldOverrideRequest.MaterialOverride> materials
    ) {
        var count = 0;
        for (var material : materials) {
            if (material.materialId() == null) {
                count += insertOverrideMaterial(tenantId, actorUserId, workOrderId, material);
                continue;
            }
            var usedAt = Boolean.TRUE.equals(material.used()) ? Objects.requireNonNullElse(material.usedAt(), Instant.now()) : material.usedAt();
            var updated = jdbcTemplate.update("""
                    UPDATE work_order_materials
                    SET used = COALESCE(?::boolean, used),
                        used_at = CASE
                            WHEN ?::boolean IS TRUE THEN COALESCE(?::timestamptz, used_at, now())
                            WHEN ?::boolean IS FALSE THEN NULL
                            ELSE COALESCE(?::timestamptz, used_at)
                        END,
                        used_by = CASE
                            WHEN ?::boolean IS TRUE THEN COALESCE(used_by, ?)
                            WHEN ?::boolean IS FALSE THEN NULL
                            ELSE used_by
                        END,
                        quantity = COALESCE(?::numeric, quantity),
                        unit_cost = COALESCE(?::numeric, unit_cost),
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                    """,
                    material.used(),
                    material.used(),
                    timestamp(usedAt),
                    material.used(),
                    timestamp(usedAt),
                    material.used(),
                    actorUserId,
                    material.used(),
                    material.quantity(),
                    material.unitCost(),
                    actorUserId,
                    tenantId,
                    workOrderId,
                    material.materialId()
            );
            count += updated;
        }
        return count;
    }

    private int insertOverrideMaterial(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            WorkOrderFieldOverrideRequest.MaterialOverride material
    ) {
        var description = blankToNull(material.description());
        if (description == null) {
            return 0;
        }
        var quantity = material.quantity() == null || material.quantity().signum() <= 0
                ? BigDecimal.ONE
                : material.quantity();
        var used = Boolean.TRUE.equals(material.used());
        var usedAt = used ? Objects.requireNonNullElse(material.usedAt(), Instant.now()) : material.usedAt();
        jdbcTemplate.update("""
                INSERT INTO work_order_materials (
                    tenant_id, work_order_id, inventory_item_id, description, quantity, unit_cost,
                    used, used_at, used_by, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?::boolean, ?::timestamptz, ?, ?, ?)
                """,
                tenantId,
                workOrderId,
                material.inventoryItemId(),
                description,
                quantity,
                material.unitCost(),
                used,
                timestamp(usedAt),
                used ? actorUserId : null,
                actorUserId,
                actorUserId
        );
        return 1;
    }

    private int applyFieldNoteOverrides(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
            List<WorkOrderFieldOverrideRequest.FieldNoteOverride> fieldNotes
    ) {
        var count = 0;
        for (var fieldNote : fieldNotes) {
            var note = blankToNull(fieldNote.note());
            if (note == null) {
                continue;
            }
            if (fieldNote.noteId() != null) {
                count += jdbcTemplate.update("""
                        UPDATE work_order_field_notes
                        SET note = ?, updated_by = ?, updated_at = now()
                        WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                        """, note, actorUserId, tenantId, workOrderId, fieldNote.noteId());
            } else {
                if (fieldNote.workerId() != null) {
                    requireAssignedWorker(tenantId, workOrderId, fieldNote.workerId());
                }
                count += jdbcTemplate.update("""
                        INSERT INTO work_order_field_notes (
                            tenant_id, work_order_id, worker_id, note, created_by, updated_by
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        """, tenantId, workOrderId, fieldNote.workerId(), note, actorUserId, actorUserId);
            }
        }
        return count;
    }

    private <T> List<T> nullToEmpty(List<T> values) {
        return values == null ? List.of() : values;
    }

    private void requireAssignedWorker(UUID tenantId, UUID workOrderId, UUID workerId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_assignments
                    WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ?
                )
                """, Boolean.class, tenantId, workOrderId, workerId));
        if (!exists) {
            throw new BadRequestException("Worker is not assigned to this work order.");
        }
    }

    private String normalizedEnum(String value, Set<String> allowedValues, String label) {
        var normalized = blankToNull(value);
        if (normalized == null) {
            return null;
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!allowedValues.contains(normalized)) {
            throw new BadRequestException("Invalid " + label + ".");
        }
        return normalized;
    }

    private String workerActivityType(String value) {
        return Objects.requireNonNullElse(normalizedEnum(value, WORKER_ACTIVITY_TYPES, "worker activity type"), "OTHER");
    }

    private Long correctedMinutes(Instant arrivedAt, Instant workStartedAt, Instant finishedAt, Long requestedMinutes) {
        if (requestedMinutes != null) {
            if (requestedMinutes < 0) {
                throw new BadRequestException("Actual work minutes cannot be negative.");
            }
            return requestedMinutes;
        }
        var start = workStartedAt != null ? workStartedAt : arrivedAt;
        if (start == null || finishedAt == null) {
            return null;
        }
        if (!finishedAt.isAfter(start)) {
            throw new BadRequestException("Actual finished time must be after actual start time.");
        }
        return java.time.Duration.between(start, finishedAt).toMinutes();
    }

    @Transactional
    public WorkOrderReviewDto notifyOwner(UUID tenantId, UUID actorUserId, UUID workOrderId, SendWorkOrderOwnerEmailRequest request) {
        var workOrder = workOrders(tenantId, workOrderId).stream()
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Work order not found."));
        if (!Set.of("APPROVED", "CUSTOMER_NOTIFIED", "INVOICED").contains(workOrder.status())) {
            throw new BadRequestException("Owner can be notified only after work is approved.");
        }
        var recipientOverride = blankToNull(request == null ? null : request.recipientEmail());
        var ccEmails = blankToNull(request == null ? null : request.ccEmails());
        var bccEmails = blankToNull(request == null ? null : request.bccEmails());
        var deliveryMode = hasOwnerCompletionDelivery(tenantId, workOrderId) ? "RESEND" : "MANUAL";
        var delivery = ownerNotificationOperations.sendWorkOrderCompleted(
                tenantId,
                actorUserId,
                completionEmail(tenantId, workOrderId, blankToNull(request == null ? null : request.note()), recipientOverride, ccEmails, bccEmails, deliveryMode)
        );
        if ("SENT".equals(delivery.status())) {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'CUSTOMER_NOTIFIED'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ? AND status = 'APPROVED'
                    """, actorUserId, tenantId, workOrderId);
            auditWriter.record(tenantId, actorUserId, "WORK_ORDER_CUSTOMER_NOTIFIED", "WORK_ORDER", workOrderId, Map.of(
                    "workOrderNumber", workOrder.workOrderNumber(),
                    "recipientEmail", delivery.recipientEmail(),
                    "deliveryStatus", delivery.status(),
                    "deliveryMode", deliveryMode
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
                        tenant_id, invoice_id, line_type, description, quantity, unit_price, line_total, taxable, tax_rate, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, false, 0, ?, ?)
                    """,
                    tenantId,
                    invoiceId,
                    invoiceLineType(line.sourceType()),
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
                SELECT wo.id, wo.customer_id, c.owner_code, c.display_name AS owner_name, wo.property_id, p.property_code, p.name AS property_name,
                       p.address_line1 || ', ' || p.city AS property_address, wo.service_type_id, st.name AS service_name,
                       st.maintenance_record_template::text AS maintenance_record_template,
                       wo.work_order_number, wo.work_order_type, wo.title, wo.description, wo.status::text AS status, wo.source::text AS source, wo.priority::text AS priority,
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
                rs.getString("work_order_type"),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_code"),
                rs.getString("owner_name"),
                rs.getObject("property_id", UUID.class),
                rs.getString("property_code"),
                rs.getString("property_name"),
                rs.getString("property_address"),
                rs.getObject("service_type_id", UUID.class),
                rs.getString("service_name"),
                serviceTemplate(rs.getString("maintenance_record_template")),
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
        var routeStops = routeStopsByWorkOrder(tenantId, workOrderIds);
        var linkedWorkOrders = linkedWorkOrdersByWorkOrder(tenantId, workOrderIds);
        var linkedFromWorkOrders = linkedFromWorkOrdersByWorkOrder(tenantId, workOrderIds);
        var fieldNotes = fieldNotesByWorkOrder(tenantId, workOrderIds);
        return rows.stream()
                .map(row -> new WorkOrderDto(
                        row.id(),
                        row.workOrderNumber(),
                        row.workOrderType(),
                        row.ownerId(),
                        row.ownerCode(),
                        row.ownerName(),
                        row.propertyId(),
                        row.propertyCode(),
                        row.propertyName(),
                        row.propertyAddress(),
                        row.serviceTypeId(),
                        row.serviceName(),
                        row.maintenanceRecordTemplate(),
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
                        tasks.getOrDefault(row.id(), List.of()),
                        routeStops.getOrDefault(row.id(), List.of()),
                        linkedWorkOrders.getOrDefault(row.id(), List.of()),
                        linkedFromWorkOrders.getOrDefault(row.id(), List.of()),
                        fieldNotes.getOrDefault(row.id(), List.of())
                ))
                .toList();
    }

    private WorkOrderCompletionEmail completionEmail(
            UUID tenantId,
            UUID workOrderId,
            String reviewNote,
            String recipientEmailOverride,
            String ccEmails,
            String bccEmails,
            String deliveryMode
    ) {
        return jdbcTemplate.query("""
                SELECT wo.id, wo.work_order_number, wo.title, c.id AS customer_id,
                       c.owner_code, c.display_name AS owner_name, c.email AS owner_email, c.billing_email AS owner_billing_email,
                       p.property_code, p.name AS property_name,
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
            var maintenanceEmailDetails = maintenanceEmailDetails(tenantId, workOrderId);
            var workerSiteDetails = workerSiteDetails(tenantId, workOrderId);
            return new WorkOrderCompletionEmail(
                    rs.getObject("id", UUID.class),
                    rs.getString("work_order_number"),
                    rs.getString("title"),
                    rs.getObject("customer_id", UUID.class),
                    rs.getString("owner_code"),
                    rs.getString("owner_name"),
                    rs.getString("owner_email"),
                    rs.getString("owner_billing_email"),
                    rs.getString("property_code"),
                    rs.getString("property_name"),
                    rs.getString("property_address"),
                    rs.getString("service_name"),
                    instant("completed_at", rs),
                    workerSiteDetails.onSiteWorkers(),
                    workerSiteDetails.arrivedOnSiteAt(),
                    workerSiteDetails.workCompletedAt(),
                    maintenanceEmailDetails.serviceDetails(),
                    maintenanceEmailDetails.deliveriesSummary(),
                    reviewNote,
                    maintenanceEmailDetails.summary(),
                    maintenanceEmailDetails.clientNote(),
                    recipientEmailOverride,
                    ccEmails,
                    bccEmails,
                    deliveryMode
            );
        }, tenantId, workOrderId);
    }

    private MaintenanceEmailDetails maintenanceEmailDetails(UUID tenantId, UUID workOrderId) {
        var summaries = new ArrayList<String>();
        var clientNotes = new ArrayList<String>();
        var serviceDetails = new ArrayList<String>();
        var deliveries = new ArrayList<String>();
        jdbcTemplate.query("""
                SELECT coalesce(w.display_name, au.display_name, 'Field worker') AS worker_name,
                       womr.template_snapshot::text AS template_snapshot,
                       womr.record_data::text AS record_data,
                       womr.note
                FROM work_order_maintenance_records womr
                LEFT JOIN workers w ON w.id = womr.worker_id AND w.tenant_id = womr.tenant_id
                LEFT JOIN app_users au ON au.id = womr.actor_user_id
                WHERE womr.tenant_id = ? AND womr.work_order_id = ?
                ORDER BY womr.updated_at
                """, rs -> {
            var workerName = blankToNull(rs.getString("worker_name"));
            var note = blankToNull(rs.getString("note"));
            var template = serviceTemplate(rs.getString("template_snapshot"));
            var recordData = metadata(rs.getString("record_data"));
            var workerLabel = workerName == null ? "Field worker" : workerName;
            if (note != null) {
                summaries.add(workerLabel + ":\n" + note);
            }
            var clientNote = blankToNull(stringValue(recordData.get("clientNote")));
            if (clientNote != null) {
                clientNotes.add(workerLabel + ": " + clientNote);
            }
            maintenanceRecordDetails(workerLabel, template, recordData, serviceDetails, deliveries);
        }, tenantId, workOrderId);
        return new MaintenanceEmailDetails(
                String.join("\n\n", summaries),
                String.join("\n", clientNotes),
                String.join("\n", serviceDetails),
                String.join("\n", deliveries)
        );
    }

    private WorkerSiteDetails workerSiteDetails(UUID tenantId, UUID workOrderId) {
        var assignments = assignmentsByWorkOrder(tenantId, Set.of(workOrderId)).getOrDefault(workOrderId, List.of());
        var workerLabels = assignments.stream()
                .map(assignment -> assignment.workerName() + (assignment.leadWorker() ? " (lead)" : ""))
                .distinct()
                .toList();
        var arrivedAt = assignments.stream()
                .map(WorkOrderDto.AssignmentDto::actualArrivedAt)
                .filter(Objects::nonNull)
                .min(Instant::compareTo)
                .orElse(null);
        var completedAt = assignments.stream()
                .map(WorkOrderDto.AssignmentDto::actualFinishedAt)
                .filter(Objects::nonNull)
                .max(Instant::compareTo)
                .orElse(null);
        return new WorkerSiteDetails(String.join(", ", workerLabels), arrivedAt, completedAt);
    }

    private void maintenanceRecordDetails(
            String workerLabel,
            Map<String, Object> template,
            Map<String, Object> recordData,
            List<String> serviceDetails,
            List<String> deliveries
    ) {
        var lines = new ArrayList<String>();
        appendCheckedLabels(lines, "Call type", listOrEmpty(template.get("callTypes")), recordMap(recordData.get("callTypes")));
        appendCheckedLabels(lines, "Completed check", listOrEmpty(template.get("checks")), recordMap(recordData.get("serviceChecks")));
        appendTextValues(lines, "Reading", listOrEmpty(template.get("chemicals")), recordMap(recordData.get("chemicalValues")));
        appendTextValues(lines, "Measurement", listOrEmpty(template.get("measurements")), recordMap(recordData.get("measurements")));
        var otherCallType = blankToNull(stringValue(recordData.get("otherCallType")));
        if (otherCallType != null) {
            lines.add("Other: " + otherCallType);
        }
        if (!lines.isEmpty()) {
            serviceDetails.add(workerLabel + ":\n" + String.join("\n", lines));
        }

        var deliveryLines = new ArrayList<String>();
        appendTextValues(deliveryLines, "", listOrEmpty(template.get("deliveries")), recordMap(recordData.get("deliveries")));
        if (!deliveryLines.isEmpty()) {
            deliveries.add(workerLabel + ":\n" + String.join("\n", deliveryLines));
        }
    }

    private void appendCheckedLabels(List<String> lines, String prefix, List<?> templateItems, Map<String, Object> values) {
        for (var item : templateItems) {
            var itemMap = recordMap(item);
            var key = blankToNull(stringValue(itemMap.get("key")));
            if (key != null && Boolean.TRUE.equals(values.get(key))) {
                var label = stringOrDefault(itemMap.get("label"), key);
                lines.add(prefix + ": " + label);
            }
        }
    }

    private void appendTextValues(List<String> lines, String prefix, List<?> templateItems, Map<String, Object> values) {
        for (var item : templateItems) {
            var itemMap = recordMap(item);
            var key = blankToNull(stringValue(itemMap.get("key")));
            if (key == null) {
                continue;
            }
            var value = blankToNull(stringValue(values.get(key)));
            if (value == null) {
                continue;
            }
            var label = stringOrDefault(itemMap.get("label"), key);
            var unit = blankToNull(stringValue(itemMap.get("unit")));
            var text = value + (unit == null ? "" : " " + unit);
            lines.add((prefix == null || prefix.isBlank() ? "" : prefix + ": ") + label + " - " + text);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> recordMap(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : Map.of();
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private record MaintenanceEmailDetails(String summary, String clientNote, String serviceDetails, String deliveriesSummary) {
    }

    private record WorkerSiteDetails(String onSiteWorkers, Instant arrivedOnSiteAt, Instant workCompletedAt) {
    }

    private boolean hasOwnerCompletionDelivery(UUID tenantId, UUID workOrderId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM email_delivery_logs
                    WHERE tenant_id = ?
                      AND work_order_id = ?
                      AND invoice_id IS NULL
                )
                """, Boolean.class, tenantId, workOrderId));
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

    private List<WorkOrderMaintenanceRecordDto> maintenanceRecords(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT womr.id, womr.work_order_id, womr.worker_id, womr.actor_user_id,
                       coalesce(w.display_name, au.display_name, 'Field worker') AS worker_name,
                       coalesce(w.email, au.email, '') AS worker_email,
                       womr.template_snapshot::text AS template_snapshot,
                       womr.record_data::text AS record_data,
                       womr.note, womr.created_at, womr.updated_at
                FROM work_order_maintenance_records womr
                LEFT JOIN workers w ON w.id = womr.worker_id AND w.tenant_id = womr.tenant_id
                LEFT JOIN app_users au ON au.id = womr.actor_user_id
                WHERE womr.tenant_id = ? AND womr.work_order_id = ?
                ORDER BY womr.updated_at DESC
                """, (rs, rowNum) -> new WorkOrderMaintenanceRecordDto(
                rs.getObject("id", UUID.class),
                rs.getObject("work_order_id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                rs.getObject("actor_user_id", UUID.class),
                rs.getString("worker_name"),
                rs.getString("worker_email"),
                serviceTemplate(rs.getString("template_snapshot")),
                metadata(rs.getString("record_data")),
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
                  AND al.action IN ('WORKER_PURCHASE_RECEIPT_UPLOADED', 'ADMIN_PURCHASE_RECEIPT_UPLOADED')
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

    private List<WorkOrderReviewDto.WorkerActivityDto> workerActivities(UUID tenantId, WorkOrderDto workOrder) {
        var workerIds = workOrder.assignments().stream()
                .map(WorkOrderDto.AssignmentDto::workerId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (workerIds.isEmpty()) {
            return List.of();
        }
        var zoneId = tenantZoneId(tenantId);
        var fromDate = workOrder.scheduledStart() == null
                ? LocalDate.now(zoneId)
                : workOrder.scheduledStart().atZone(zoneId).toLocalDate();
        var toDate = workOrder.scheduledEnd() == null
                ? fromDate
                : workOrder.scheduledEnd().atZone(zoneId).toLocalDate();
        var placeholders = String.join(",", java.util.Collections.nCopies(workerIds.size(), "?"));
        var args = new ArrayList<Object>();
        args.add(tenantId);
        args.addAll(workerIds);
        args.add(fromDate);
        args.add(toDate);
        return jdbcTemplate.query("""
                SELECT wda.id, wda.worker_id,
                       coalesce(au.display_name, w.display_name, 'Field worker') AS worker_name,
                       coalesce(au.email, w.email, '') AS worker_email,
                       wda.activity_type, wda.title, wda.location_name, wda.address, wda.notes,
                       wda.started_at, wda.ended_at,
                       CASE WHEN wda.ended_at IS NULL THEN NULL
                            ELSE floor(extract(epoch from (wda.ended_at - wda.started_at)) / 60)::bigint
                       END AS duration_minutes
                FROM worker_daily_activities wda
                JOIN workers w ON w.id = wda.worker_id AND w.tenant_id = wda.tenant_id
                LEFT JOIN app_users au ON au.id = w.user_id
                WHERE wda.tenant_id = ?
                  AND wda.worker_id IN (%s)
                  AND wda.activity_date >= ?
                  AND wda.activity_date <= ?
                ORDER BY wda.started_at DESC
                """.formatted(placeholders), (rs, rowNum) -> new WorkOrderReviewDto.WorkerActivityDto(
                rs.getObject("id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                rs.getString("worker_name"),
                rs.getString("worker_email"),
                rs.getString("activity_type"),
                rs.getString("title"),
                rs.getString("location_name"),
                rs.getString("address"),
                rs.getString("notes"),
                instant("started_at", rs),
                instant("ended_at", rs),
                (Long) rs.getObject("duration_minutes"),
                instant("ended_at", rs) == null
        ), args.toArray());
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
                SELECT i.id, i.invoice_number, i.status::text AS status, i.issued_on::text AS issued_on,
                       i.due_on::text AS due_on, i.subtotal::text AS subtotal, i.tax_total::text AS tax_total, i.total::text AS total
                FROM invoices i
                WHERE i.tenant_id = ?
                  AND i.status <> 'VOID'
                  AND (
                    i.work_order_id = ?
                    OR EXISTS (
                        SELECT 1
                        FROM invoice_work_orders iwo
                        WHERE iwo.tenant_id = i.tenant_id
                          AND iwo.invoice_id = i.id
                          AND iwo.work_order_id = ?
                    )
                  )
                ORDER BY i.created_at DESC
                """, (rs, rowNum) -> new WorkOrderReviewDto.InvoiceDto(
                rs.getObject("id", UUID.class),
                rs.getString("invoice_number"),
                rs.getString("status"),
                rs.getString("issued_on"),
                rs.getString("due_on"),
                rs.getString("subtotal"),
                rs.getString("tax_total"),
                rs.getString("total")
        ), tenantId, workOrderId, workOrderId);
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
                       edl.delivery_mode,
                       edl.sent_at,
                       edl.created_at
                FROM email_delivery_logs edl
                LEFT JOIN invoices i ON i.id = edl.invoice_id AND i.tenant_id = edl.tenant_id
                WHERE edl.tenant_id = ?
                  AND (
                    edl.work_order_id = ?
                    OR i.work_order_id = ?
                    OR EXISTS (
                        SELECT 1
                        FROM invoice_work_orders iwo
                        WHERE iwo.tenant_id = i.tenant_id
                          AND iwo.invoice_id = i.id
                          AND iwo.work_order_id = ?
                    )
                  )
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
                rs.getString("delivery_mode"),
                instant("sent_at", rs),
                instant("created_at", rs)
        ), tenantId, workOrderId, workOrderId, workOrderId);
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

    private String invoiceLineType(String sourceType) {
        if ("MATERIAL".equals(sourceType)) {
            return "MATERIAL";
        }
        return "LABOR";
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
        var placeholders = placeholders(workOrderIds);
        var args = new ArrayList<Object>();
        args.add(tenantId);
        args.addAll(workOrderIds);
        args.add(tenantId);
        args.addAll(workOrderIds);
        args.add(tenantId);
        args.addAll(workOrderIds);
        var assignments = new LinkedHashMap<UUID, List<WorkOrderDto.AssignmentDto>>();
        jdbcTemplate.query("""
                WITH field_timing AS (
                    SELECT al.resource_id AS work_order_id,
                           (al.metadata ->> 'workerId')::uuid AS worker_id,
                           MIN(al.created_at) FILTER (WHERE al.action = 'WORKER_START_TRAVEL') AS actual_travel_started_at,
                           MIN(al.created_at) FILTER (WHERE al.action = 'WORKER_ARRIVE_ON_SITE') AS actual_arrived_at,
                           MIN(al.created_at) FILTER (WHERE al.action = 'WORKER_START_WORK') AS actual_work_started_at,
                           MAX(al.created_at) FILTER (WHERE al.action = 'WORKER_COMPLETE_WORK') AS actual_finished_at
                    FROM audit_logs al
                    WHERE al.tenant_id = ?
                      AND al.resource_type = 'WORK_ORDER'
                      AND al.resource_id IN (%s)
                      AND al.action IN ('WORKER_START_TRAVEL', 'WORKER_ARRIVE_ON_SITE', 'WORKER_START_WORK', 'WORKER_COMPLETE_WORK')
                      AND jsonb_exists(al.metadata, 'workerId')
                    GROUP BY al.resource_id, (al.metadata ->> 'workerId')::uuid
                ),
                work_minutes AS (
                    SELECT wote.work_order_id, wote.worker_id,
                           floor(sum(extract(epoch from (coalesce(wote.ended_at, now()) - wote.started_at))) / 60)::bigint AS actual_work_minutes
                    FROM work_order_time_entries wote
                    WHERE wote.tenant_id = ?
                      AND wote.work_order_id IN (%s)
                    GROUP BY wote.work_order_id, wote.worker_id
                )
                SELECT woa.work_order_id, woa.worker_id,
                       COALESCE(u.display_name, w.display_name) AS display_name,
                       COALESCE(u.email, w.email) AS email,
                       woa.lead_worker,
                       COALESCE(wao.assignment_status, woa.assignment_status)::text AS assignment_status,
                       woa.assignment_role, woa.notes,
                       ft.actual_travel_started_at,
                       COALESCE(wao.actual_arrived_at, ft.actual_arrived_at) AS actual_arrived_at,
                       COALESCE(wao.actual_work_started_at, ft.actual_work_started_at) AS actual_work_started_at,
                       COALESCE(wao.actual_finished_at, ft.actual_finished_at) AS actual_finished_at,
                       COALESCE(wao.actual_work_minutes, wm.actual_work_minutes) AS actual_work_minutes,
                       woa.estimated_travel_minutes, woa.estimated_travel_distance_meters,
                       woa.travel_estimate_provider, woa.travel_estimated_at,
                       wao.id IS NOT NULL AS timing_override,
                       wao.reason AS override_reason,
                       wao.updated_at AS override_updated_at
                FROM work_order_assignments woa
                JOIN workers w ON w.id = woa.worker_id AND w.tenant_id = woa.tenant_id
                LEFT JOIN app_users u ON u.id = w.user_id
                LEFT JOIN field_timing ft ON ft.work_order_id = woa.work_order_id AND ft.worker_id = woa.worker_id
                LEFT JOIN work_minutes wm ON wm.work_order_id = woa.work_order_id AND wm.worker_id = woa.worker_id
                LEFT JOIN work_order_assignment_overrides wao
                    ON wao.tenant_id = woa.tenant_id
                   AND wao.work_order_id = woa.work_order_id
                   AND wao.worker_id = woa.worker_id
                WHERE woa.tenant_id = ?
                  AND woa.work_order_id IN (%s)
                ORDER BY woa.lead_worker DESC, COALESCE(u.display_name, w.display_name)
                """.formatted(placeholders, placeholders, placeholders), (RowCallbackHandler) rs -> assignments.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.AssignmentDto(
                        rs.getObject("worker_id", UUID.class),
                        rs.getString("display_name"),
                        rs.getString("email"),
                        rs.getBoolean("lead_worker"),
                        rs.getString("assignment_status"),
                        rs.getString("assignment_role"),
                        rs.getString("notes"),
                        instant("actual_travel_started_at", rs),
                        instant("actual_arrived_at", rs),
                        instant("actual_work_started_at", rs),
                        instant("actual_finished_at", rs),
                        (Long) rs.getObject("actual_work_minutes"),
                        (Integer) rs.getObject("estimated_travel_minutes"),
                        (Integer) rs.getObject("estimated_travel_distance_meters"),
                        rs.getString("travel_estimate_provider"),
                        instant("travel_estimated_at", rs),
                        rs.getBoolean("timing_override"),
                        rs.getString("override_reason"),
                        instant("override_updated_at", rs)
                )
        ), args.toArray());
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

    private Map<UUID, List<WorkOrderDto.RouteStopDto>> routeStopsByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var routeStops = new LinkedHashMap<UUID, List<WorkOrderDto.RouteStopDto>>();
        jdbcTemplate.query("""
                SELECT id, work_order_id, stop_order, stop_type, name, address, instructions, planned_arrival, visible_to_worker,
                       estimated_travel_minutes, estimated_travel_distance_meters, travel_estimate_provider, travel_estimated_at,
                       arrived_at, completed_at, skipped_at, skipped_reason
                FROM work_order_route_stops
                WHERE tenant_id = ?
                  AND work_order_id IN (%s)
                ORDER BY stop_order, name
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> routeStops.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.RouteStopDto(
                        rs.getObject("id", UUID.class),
                        rs.getInt("stop_order"),
                        rs.getString("stop_type"),
                        rs.getString("name"),
                        rs.getString("address"),
                        rs.getString("instructions"),
                        instant("planned_arrival", rs),
                        rs.getBoolean("visible_to_worker"),
                        (Integer) rs.getObject("estimated_travel_minutes"),
                        (Integer) rs.getObject("estimated_travel_distance_meters"),
                        rs.getString("travel_estimate_provider"),
                        instant("travel_estimated_at", rs),
                        instant("arrived_at", rs),
                        instant("completed_at", rs),
                        instant("skipped_at", rs),
                        rs.getString("skipped_reason")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return routeStops;
    }

    private Map<UUID, List<WorkOrderDto.LinkedWorkOrderDto>> linkedWorkOrdersByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var linkedWorkOrders = new LinkedHashMap<UUID, List<WorkOrderDto.LinkedWorkOrderDto>>();
        jdbcTemplate.query("""
                SELECT wol.work_order_id, wol.linked_work_order_id, linked.work_order_number, linked.title,
                       p.name AS property_name, linked.status::text AS status, wol.link_type, wol.notes
                FROM work_order_links wol
                JOIN work_orders linked ON linked.id = wol.linked_work_order_id AND linked.tenant_id = wol.tenant_id
                JOIN properties p ON p.id = linked.property_id AND p.tenant_id = linked.tenant_id
                WHERE wol.tenant_id = ?
                  AND wol.work_order_id IN (%s)
                ORDER BY linked.scheduled_start NULLS LAST, linked.updated_at DESC
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> linkedWorkOrders.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.LinkedWorkOrderDto(
                        rs.getObject("linked_work_order_id", UUID.class),
                        rs.getString("work_order_number"),
                        rs.getString("title"),
                        rs.getString("property_name"),
                        rs.getString("status"),
                        rs.getString("link_type"),
                        rs.getString("notes")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return linkedWorkOrders;
    }

    private Map<UUID, List<WorkOrderDto.LinkedWorkOrderDto>> linkedFromWorkOrdersByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var linkedFromWorkOrders = new LinkedHashMap<UUID, List<WorkOrderDto.LinkedWorkOrderDto>>();
        jdbcTemplate.query("""
                SELECT wol.linked_work_order_id AS work_order_id, wol.work_order_id AS source_work_order_id,
                       source.work_order_number, source.title, p.name AS property_name,
                       source.status::text AS status, wol.link_type, wol.notes
                FROM work_order_links wol
                JOIN work_orders source ON source.id = wol.work_order_id AND source.tenant_id = wol.tenant_id
                JOIN properties p ON p.id = source.property_id AND p.tenant_id = source.tenant_id
                WHERE wol.tenant_id = ?
                  AND wol.linked_work_order_id IN (%s)
                ORDER BY source.scheduled_start NULLS LAST, source.updated_at DESC
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> linkedFromWorkOrders.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.LinkedWorkOrderDto(
                        rs.getObject("source_work_order_id", UUID.class),
                        rs.getString("work_order_number"),
                        rs.getString("title"),
                        rs.getString("property_name"),
                        rs.getString("status"),
                        rs.getString("link_type"),
                        rs.getString("notes")
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return linkedFromWorkOrders;
    }

    private Map<UUID, List<WorkOrderDto.FieldNoteDto>> fieldNotesByWorkOrder(UUID tenantId, Set<UUID> workOrderIds) {
        if (workOrderIds.isEmpty()) {
            return Map.of();
        }
        var fieldNotes = new LinkedHashMap<UUID, List<WorkOrderDto.FieldNoteDto>>();
        jdbcTemplate.query("""
                SELECT wofn.id, wofn.work_order_id, wofn.worker_id,
                       coalesce(w.display_name, au.display_name, 'Field worker') AS worker_name,
                       coalesce(w.email, au.email, '') AS worker_email,
                       wofn.note, wofn.created_at, wofn.updated_at
                FROM work_order_field_notes wofn
                LEFT JOIN workers w ON w.id = wofn.worker_id AND w.tenant_id = wofn.tenant_id
                LEFT JOIN app_users au ON au.id = wofn.created_by
                WHERE wofn.tenant_id = ?
                  AND wofn.work_order_id IN (%s)
                ORDER BY wofn.created_at
                """.formatted(placeholders(workOrderIds)), (RowCallbackHandler) rs -> fieldNotes.computeIfAbsent(rs.getObject("work_order_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkOrderDto.FieldNoteDto(
                        rs.getObject("id", UUID.class),
                        rs.getObject("worker_id", UUID.class),
                        rs.getString("worker_name"),
                        rs.getString("worker_email"),
                        rs.getString("note"),
                        instant("created_at", rs),
                        instant("updated_at", rs)
                )
        ), tenantAndWorkOrderArgs(tenantId, workOrderIds));
        return fieldNotes;
    }

    private void requireLinkedDependenciesComplete(UUID tenantId, UUID workOrderId) {
        var openDependencies = jdbcTemplate.query("""
                SELECT blocking.work_order_number, blocking.title, blocking.status::text AS status
                FROM (
                    SELECT wol.work_order_id AS dependency_work_order_id
                    FROM work_order_links wol
                    WHERE wol.tenant_id = ?
                      AND wol.linked_work_order_id = ?
                      AND wol.link_type IN ('BLOCKS', 'PICKUP_FOR')
                    UNION ALL
                    SELECT wol.linked_work_order_id AS dependency_work_order_id
                    FROM work_order_links wol
                    WHERE wol.tenant_id = ?
                      AND wol.work_order_id = ?
                      AND wol.link_type = 'FOLLOWS'
                ) dependency
                JOIN work_orders blocking ON blocking.id = dependency.dependency_work_order_id AND blocking.tenant_id = ?
                WHERE blocking.status::text NOT IN ('PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID')
                ORDER BY blocking.scheduled_start NULLS LAST, blocking.updated_at DESC
                """, (rs, rowNum) -> "%s %s (%s)".formatted(
                rs.getString("work_order_number"),
                rs.getString("title"),
                rs.getString("status")
        ), tenantId, workOrderId, tenantId, workOrderId, tenantId);
        if (!openDependencies.isEmpty()) {
            throw new BadRequestException("Complete linked dependency work first: " + String.join("; ", openDependencies));
        }
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
        var routeStopBefore = routeStopAudit(before.routeStops());
        var routeStopAfter = routeStopAudit(after.routeStops());
        var linkedWorkOrderBefore = linkedWorkOrderAudit(before.linkedWorkOrders());
        var linkedWorkOrderAfter = linkedWorkOrderAudit(after.linkedWorkOrders());

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
        if (!routeStopBefore.equals(routeStopAfter)) {
            collectionNames.add("routeStops");
        }
        if (!linkedWorkOrderBefore.equals(linkedWorkOrderAfter)) {
            collectionNames.add("linkedWorkOrders");
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
        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_ROUTE_STOPS_UPDATED", routeStopBefore, routeStopAfter);
        auditCollectionChange(tenantId, actorUserId, workOrderId, after, "WORK_ORDER_LINKS_UPDATED", linkedWorkOrderBefore, linkedWorkOrderAfter);
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
        putChange(changes, "workOrderType", before.workOrderType(), after.workOrderType());
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

    private List<Map<String, Object>> routeStopAudit(List<WorkOrderDto.RouteStopDto> routeStops) {
        return routeStops.stream()
                .map(routeStop -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("id", routeStop.id().toString());
                    item.put("stopOrder", routeStop.stopOrder());
                    item.put("stopType", routeStop.stopType());
                    item.put("name", routeStop.name());
                    item.put("address", routeStop.address());
                    item.put("instructions", routeStop.instructions());
                    item.put("plannedArrival", routeStop.plannedArrival() == null ? null : routeStop.plannedArrival().toString());
                    item.put("arrivedAt", routeStop.arrivedAt() == null ? null : routeStop.arrivedAt().toString());
                    item.put("completedAt", routeStop.completedAt() == null ? null : routeStop.completedAt().toString());
                    item.put("skippedAt", routeStop.skippedAt() == null ? null : routeStop.skippedAt().toString());
                    item.put("skippedReason", routeStop.skippedReason());
                    return item;
                })
                .toList();
    }

    private List<Map<String, Object>> linkedWorkOrderAudit(List<WorkOrderDto.LinkedWorkOrderDto> linkedWorkOrders) {
        return linkedWorkOrders.stream()
                .map(linkedWorkOrder -> {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("linkedWorkOrderId", linkedWorkOrder.linkedWorkOrderId().toString());
                    item.put("workOrderNumber", linkedWorkOrder.workOrderNumber());
                    item.put("title", linkedWorkOrder.title());
                    item.put("propertyName", linkedWorkOrder.propertyName());
                    item.put("status", linkedWorkOrder.status());
                    item.put("linkType", linkedWorkOrder.linkType());
                    item.put("notes", linkedWorkOrder.notes());
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
            String workOrderType,
            UUID ownerId,
            String ownerCode,
            String ownerName,
            UUID propertyId,
            String propertyCode,
            String propertyName,
            String propertyAddress,
            UUID serviceTypeId,
            String serviceName,
            Map<String, Object> maintenanceRecordTemplate,
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

    private void replaceRouteStops(UUID tenantId, UUID workOrderId, UUID actorUserId, List<CreateWorkOrderRequest.RouteStopRequest> routeStops) {
        if (routeStops == null) {
            return;
        }
        jdbcTemplate.update("DELETE FROM work_order_route_stops WHERE tenant_id = ? AND work_order_id = ?", tenantId, workOrderId);
        var order = 1;
        for (var routeStop : routeStops) {
            if (routeStop == null || routeStop.name() == null || routeStop.name().isBlank()) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO work_order_route_stops (
                        tenant_id, work_order_id, stop_order, stop_type, name, address, instructions, planned_arrival, visible_to_worker, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    tenantId,
                    workOrderId,
                    order++,
                    routeStopType(routeStop.stopType()),
                    routeStop.name().trim(),
                    blankToNull(routeStop.address()),
                    blankToNull(routeStop.instructions()),
                    timestamp(routeStop.plannedArrival()),
                    routeStop.visibleToWorker() == null || routeStop.visibleToWorker(),
                    actorUserId,
                    actorUserId
            );
        }
    }

    private void replaceWorkOrderLinks(UUID tenantId, UUID workOrderId, UUID actorUserId, List<CreateWorkOrderRequest.WorkOrderLinkRequest> linkedWorkOrders) {
        if (linkedWorkOrders == null) {
            return;
        }
        jdbcTemplate.update("DELETE FROM work_order_links WHERE tenant_id = ? AND work_order_id = ?", tenantId, workOrderId);
        for (var link : linkedWorkOrders) {
            if (link == null || link.linkedWorkOrderId() == null) {
                continue;
            }
            if (workOrderId.equals(link.linkedWorkOrderId())) {
                throw new BadRequestException("A work order cannot be linked to itself.");
            }
            requireWorkOrder(tenantId, link.linkedWorkOrderId());
            jdbcTemplate.update("""
                    INSERT INTO work_order_links (
                        tenant_id, work_order_id, linked_work_order_id, link_type, notes, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (tenant_id, work_order_id, linked_work_order_id, link_type)
                    DO UPDATE SET notes = excluded.notes,
                                  updated_by = excluded.updated_by,
                                  updated_at = now()
                    """,
                    tenantId,
                    workOrderId,
                    link.linkedWorkOrderId(),
                    workOrderLinkType(link.linkType()),
                    blankToNull(link.notes()),
                    actorUserId,
                    actorUserId
            );
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

    private String workOrderType(String workOrderType) {
        if (workOrderType == null || workOrderType.isBlank()) {
            return "SERVICE";
        }
        var normalized = workOrderType.trim().toUpperCase(Locale.ROOT);
        return WORK_ORDER_TYPES.contains(normalized) ? normalized : "SERVICE";
    }

    private String routeStopType(String stopType) {
        if (stopType == null || stopType.isBlank()) {
            return "PICKUP";
        }
        var normalized = stopType.trim().toUpperCase(Locale.ROOT);
        return Set.of("PICKUP", "DELIVERY", "RETURN", "KEYS", "SUPPLIER", "WAREHOUSE", "OWNER", "OTHER").contains(normalized) ? normalized : "OTHER";
    }

    private void validatePickupRouteStops(String workOrderType, List<CreateWorkOrderRequest.RouteStopRequest> routeStops) {
        if (!"PICKUP_DELIVERY".equals(workOrderType)) {
            return;
        }
        var hasStop = routeStops != null && routeStops.stream()
                .anyMatch(routeStop -> routeStop != null && routeStop.name() != null && !routeStop.name().isBlank());
        if (!hasStop) {
            throw new BadRequestException("Pickup or delivery work orders require at least one route stop.");
        }
    }

    private String workOrderLinkType(String linkType) {
        if (linkType == null || linkType.isBlank()) {
            return "RELATED";
        }
        var normalized = linkType.trim().toUpperCase(Locale.ROOT);
        return Set.of("RELATED", "BLOCKS", "FOLLOWS", "SAME_RECURRENCE", "PICKUP_FOR").contains(normalized) ? normalized : "RELATED";
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

    private String requiredCaption(String caption) {
        var normalized = blankToNull(caption);
        if (normalized == null) {
            throw new BadRequestException("Caption is required for uploaded evidence.");
        }
        return normalized.trim();
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

    private String normalizeEvidenceAction(String action) {
        if (action == null || action.isBlank()) {
            throw new BadRequestException("Evidence action is required.");
        }
        var normalized = action.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("ADD_PHOTO", "ADD_PURCHASE_RECEIPT").contains(normalized)) {
            throw new BadRequestException("Evidence action is not supported.");
        }
        return normalized;
    }

    private String normalizePhotoType(String photoType) {
        var normalized = photoType == null || photoType.isBlank() ? "OTHER" : photoType.trim().toUpperCase(Locale.ROOT);
        if (!Set.of("BEFORE", "AFTER", "ISSUE", "OTHER").contains(normalized)) {
            throw new BadRequestException("Photo type is not supported.");
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

    private Map<String, Object> serviceTemplate(String value) {
        try {
            return normalizedTemplate(objectMapper.readValue(value == null ? "{}" : value, METADATA_TYPE));
        } catch (Exception exception) {
            return EMPTY_MAINTENANCE_RECORD_TEMPLATE;
        }
    }

    private Map<String, Object> normalizedTemplate(Map<String, Object> template) {
        if (template == null || template.isEmpty()) {
            return EMPTY_MAINTENANCE_RECORD_TEMPLATE;
        }
        var normalized = new LinkedHashMap<String, Object>();
        normalized.put("enabled", Boolean.TRUE.equals(template.get("enabled")));
        normalized.put("title", stringOrDefault(template.get("title"), "Maintenance record"));
        normalized.put("callTypes", listOrEmpty(template.get("callTypes")));
        normalized.put("checks", listOrEmpty(template.get("checks")));
        normalized.put("measurements", listOrEmpty(template.get("measurements")));
        normalized.put("chemicals", listOrEmpty(template.get("chemicals")));
        normalized.put("deliveries", listOrEmpty(template.get("deliveries")));
        normalized.put("noteLabel", stringOrDefault(template.get("noteLabel"), "Client note"));
        return normalized;
    }

    private List<?> listOrEmpty(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private String stringOrDefault(Object value, String fallback) {
        return value instanceof String text && !text.isBlank() ? text : fallback;
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
