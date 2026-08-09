package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.fieldwork.internal.dto.WorkerAssignedJobDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionResponse;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkerJobService {
    private static final int EVIDENCE_LIMIT_PER_GROUP = 15;

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final DocumentStorageService documentStorageService;
    private final WorkerShiftClockService workerShiftClockService;
    private final ThreadLocal<WorkerJobActionRequest> actionRequestContext = new ThreadLocal<>();

    public WorkerJobService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            DocumentStorageService documentStorageService,
            WorkerShiftClockService workerShiftClockService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.documentStorageService = documentStorageService;
        this.workerShiftClockService = workerShiftClockService;
    }

    @Transactional(readOnly = true)
    public List<WorkerAssignedJobDto> assignedJobs(UUID tenantId, UUID userId, String email, LocalDate from, LocalDate to) {
        var worker = worker(tenantId, userId, email);
        var zoneId = tenantZoneId(tenantId);
        var start = Timestamp.from((from == null ? LocalDate.now(zoneId).minusDays(30) : from).atStartOfDay(zoneId).toInstant());
        var end = Timestamp.from((to == null ? LocalDate.now(zoneId).plusDays(60) : to.plusDays(1)).atStartOfDay(zoneId).toInstant());
        var jobs = jdbcTemplate.query("""
                SELECT wo.id, wo.work_order_number, wo.title, p.name AS property_name, c.display_name AS owner_name,
                       concat_ws(', ', p.address_line1, nullif(p.address_line2, ''), p.city, p.province_code, p.postal_code) AS address,
                       st.name AS service_name, wo.status::text AS status, wo.priority::text AS priority,
                       wo.scheduled_start, wo.scheduled_end, wo.description AS notes,
                       woa.lead_worker, woa.assignment_status::text AS assignment_status
                FROM work_order_assignments woa
                JOIN work_orders wo ON wo.id = woa.work_order_id AND wo.tenant_id = woa.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                JOIN customers c ON c.id = wo.customer_id AND c.tenant_id = wo.tenant_id
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                WHERE woa.tenant_id = ?
                  AND woa.worker_id = ?
                  AND wo.status <> 'CANCELLED'
                  AND (wo.scheduled_start IS NULL OR (wo.scheduled_start >= ? AND wo.scheduled_start < ?))
                ORDER BY wo.scheduled_start NULLS LAST, wo.priority DESC, wo.updated_at DESC
                """, (rs, rowNum) -> new WorkerAssignedJobDto(
                rs.getObject("id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("title"),
                rs.getString("property_name"),
                rs.getString("owner_name"),
                rs.getString("address"),
                rs.getString("service_name"),
                rs.getString("status"),
                rs.getString("priority"),
                instant("scheduled_start", rs),
                instant("scheduled_end", rs),
                rs.getString("notes"),
                rs.getBoolean("lead_worker"),
                rs.getString("assignment_status"),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        ), tenantId, worker.id(), start, end);
        return jobs.stream()
                .map(job -> jobWithDetails(tenantId, worker.id(), worker.userId(), job))
                .toList();
    }

    @Transactional
    public WorkerJobActionResponse applyAction(
            UUID tenantId,
            UUID userId,
            String email,
            UUID workOrderId,
        WorkerJobActionRequest request
    ) {
        var worker = worker(tenantId, userId, email);
        var action = normalizeAction(request.action());
        workerShiftClockService.requireClockedIn(tenantId, userId, email);
        requireAssigned(tenantId, worker.id(), workOrderId);
        var now = Instant.now();
        requireActionAllowed(tenantId, worker.id(), workOrderId, action, now);
        actionRequestContext.set(request);
        try {
            switch (action) {
                case "VIEW_DISPATCH" -> recordViewAction(tenantId, worker, workOrderId, "WORKER_VIEWED_DISPATCH", "Dispatch instructions viewed.", now);
                case "VIEW_PRE_START_CHECKLIST" -> recordViewAction(tenantId, worker, workOrderId, "WORKER_VIEWED_PRE_START_CHECKLIST", "Pre-start checklist viewed.", now);
                case "VIEW_COMPLETION_CHECKLIST" -> recordViewAction(tenantId, worker, workOrderId, "WORKER_VIEWED_COMPLETION_CHECKLIST", "Completion checklist viewed.", now);
                case "VIEW_TIMELINE" -> recordViewAction(tenantId, worker, workOrderId, "WORKER_VIEWED_TIMELINE", "Execution timeline viewed.", now);
                case "START_TRAVEL" -> updateWorkState(tenantId, worker, workOrderId, "TRAVELING", "ACCEPTED", now, action, request.note());
                case "ARRIVE_ON_SITE" -> updateWorkState(tenantId, worker, workOrderId, "ON_SITE", "ON_SITE", now, action, request.note());
                case "START_WORK" -> {
                    var remainingPreStartChecks = remainingRequiredChecklistCount(tenantId, worker.id(), workOrderId, "PRE_START");
                    if (remainingPreStartChecks > 0) {
                        throw new BadRequestException("Complete all required pre-start checks before starting work.");
                    }
                    updateWorkState(tenantId, worker, workOrderId, "IN_PROGRESS", "IN_PROGRESS", now, action, request.note());
                    startTimeEntry(tenantId, worker, workOrderId, userId, now);
                }
                case "PAUSE_WORK" -> {
                    updateWorkState(tenantId, worker, workOrderId, "PAUSED", "PAUSED", now, action, request.note());
                    endOpenTimeEntry(tenantId, worker.id(), workOrderId, userId, now);
                }
                case "RESUME_WORK" -> {
                    updateWorkState(tenantId, worker, workOrderId, "IN_PROGRESS", "IN_PROGRESS", now, action, request.note());
                    startTimeEntry(tenantId, worker, workOrderId, userId, now);
                }
                case "COMPLETE_WORK" -> completeWork(tenantId, worker, userId, workOrderId, request.note(), now);
                case "COMPLETE_CHECKLIST" -> completeChecklist(tenantId, worker, userId, workOrderId, request.taskId(), now);
                case "ADD_MATERIAL_USED" -> addMaterialUsed(tenantId, worker, userId, workOrderId, request, now);
                case "RETURN_TOOL" -> recordToolReturn(tenantId, worker, userId, workOrderId, request.assetId(), request.note(), now);
                case "LEAVE_EMERGENCY" -> leaveEmergency(tenantId, worker, userId, workOrderId, request.note(), now);
                case "ADD_PHOTO" -> recordPhoto(tenantId, worker, workOrderId, request, now);
                case "ADD_PURCHASE_RECEIPT" -> recordPurchaseReceipt(tenantId, worker, workOrderId, request, now);
                case "ADD_NOTE" -> recordNote(tenantId, worker, workOrderId, request.note(), now);
                case "UPDATE_NOTE" -> updateNote(tenantId, worker, workOrderId, request.noteId(), request.note(), now);
                default -> throw new BadRequestException("Worker action is not supported.");
            }
        } finally {
            actionRequestContext.remove();
        }
        return new WorkerJobActionResponse(job(tenantId, worker, workOrderId), message(action));
    }

    @Transactional(readOnly = true)
    public void requireAssignedJob(UUID tenantId, UUID userId, String email, UUID workOrderId) {
        var worker = worker(tenantId, userId, email);
        requireAssigned(tenantId, worker.id(), workOrderId);
    }

    @Transactional(readOnly = true)
    public void requireEvidenceUploadAllowed(UUID tenantId, UUID userId, String email, UUID workOrderId) {
        var worker = worker(tenantId, userId, email);
        requireAssigned(tenantId, worker.id(), workOrderId);
        requireActionAllowed(tenantId, worker.id(), workOrderId, "ADD_PHOTO", Instant.now());
    }

    @Transactional(readOnly = true)
    public void requireEvidenceLimitAvailable(UUID tenantId, UUID workOrderId, String documentType, String photoType) {
        var normalizedDocumentType = blankToNull(documentType) == null ? "WORK_PHOTO" : documentType.trim().toUpperCase();
        if ("PURCHASE_RECEIPT".equals(normalizedDocumentType)) {
            if (receiptCount(tenantId, workOrderId) >= EVIDENCE_LIMIT_PER_GROUP) {
                throw new BadRequestException("This work order already has 15 purchase receipts. Delete one before uploading another.");
            }
            return;
        }
        var normalizedPhotoType = blankToNull(photoType) == null ? "OTHER" : photoType.trim().toUpperCase();
        if (photoCount(tenantId, workOrderId, normalizedPhotoType) >= EVIDENCE_LIMIT_PER_GROUP) {
            throw new BadRequestException("This work order already has 15 %s photos. Delete one before uploading another.".formatted(normalizedPhotoType.toLowerCase()));
        }
    }

    @Transactional
    public WorkerJobActionResponse deleteEvidence(UUID tenantId, UUID userId, String email, UUID workOrderId, UUID documentId) {
        var worker = worker(tenantId, userId, email);
        workerShiftClockService.requireClockedIn(tenantId, userId, email);
        requireAssigned(tenantId, worker.id(), workOrderId);
        var now = Instant.now();
        requireActionAllowed(tenantId, worker.id(), workOrderId, "DELETE_EVIDENCE", now);
        requireWorkerCreatedEvidence(tenantId, worker.userId(), workOrderId, documentId);
        var deleted = documentStorageService.deleteWorkOrderDocument(tenantId, workOrderId, documentId);
        auditAction(tenantId, worker, workOrderId, "WORKER_EVIDENCE_DELETED", Map.of(
                "documentId", deleted.documentId().toString(),
                "objectKey", deleted.objectKey(),
                "actionAt", now.toString()
        ));
        return new WorkerJobActionResponse(job(tenantId, worker, workOrderId), "Evidence deleted.");
    }

    private void updateWorkState(
            UUID tenantId,
            WorkerRef worker,
            UUID workOrderId,
            String status,
            String assignmentStatus,
            Instant actionAt,
            String action,
            String note
    ) {
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = ?::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND status NOT IN ('CANCELLED', 'COMPLETED', 'APPROVED')
                """, status, worker.userId(), tenantId, workOrderId);
        jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET assignment_status = ?::work_order_assignment_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ?
                """, assignmentStatus, worker.userId(), tenantId, workOrderId, worker.id());
        auditAction(tenantId, worker, workOrderId, auditActionName(action), Map.of(
                "status", status,
                "assignmentStatus", assignmentStatus,
                "actionAt", actionAt.toString(),
                "note", note == null ? "" : note
        ));
    }

    private void recordViewAction(UUID tenantId, WorkerRef worker, UUID workOrderId, String auditAction, String label, Instant actionAt) {
        auditAction(tenantId, worker, workOrderId, auditAction, Map.of(
                "viewedAt", actionAt.toString(),
                "label", label
        ));
    }

    private void requireActionAllowed(UUID tenantId, UUID workerId, UUID workOrderId, String action, Instant actionAt) {
        if (isViewAction(action)) {
            return;
        }
        var gate = actionGate(tenantId, workerId, workOrderId);
        if (isFutureServiceDate(tenantId, gate.scheduledStart(), actionAt)) {
            throw new BadRequestException("This job is scheduled for a future date. You can view it now, but field actions unlock on the service date.");
        }
        if (Set.of("CANCELLED", "APPROVED", "CUSTOMER_NOTIFIED", "INVOICED", "PAID").contains(gate.status())) {
            throw new BadRequestException("This job is closed for worker actions.");
        }
        if (Set.of("PENDING_COMPLETION", "COMPLETED").contains(gate.status())
                && !isEvidenceAction(action)
                && terminalAssignmentStatus(gate.assignmentStatus())) {
            throw new BadRequestException("This job is submitted for review. Only photos and purchase receipts can still be added.");
        }
    }

    private ActionGate actionGate(UUID tenantId, UUID workerId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT wo.status::text AS status, wo.scheduled_start, woa.assignment_status::text AS assignment_status
                FROM work_orders wo
                JOIN work_order_assignments woa ON woa.tenant_id = wo.tenant_id AND woa.work_order_id = wo.id
                WHERE wo.tenant_id = ? AND wo.id = ? AND woa.worker_id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Assigned job not found.");
            }
            return new ActionGate(
                    rs.getString("status"),
                    instant("scheduled_start", rs),
                    rs.getString("assignment_status")
            );
        }, tenantId, workOrderId, workerId);
    }

    private boolean isFutureServiceDate(UUID tenantId, Instant scheduledStart, Instant actionAt) {
        if (scheduledStart == null) {
            return false;
        }
        var zoneId = tenantZoneId(tenantId);
        return scheduledStart.atZone(zoneId).toLocalDate().isAfter(actionAt.atZone(zoneId).toLocalDate());
    }

    private boolean isEvidenceAction(String action) {
        return "ADD_PHOTO".equals(action) || "ADD_PURCHASE_RECEIPT".equals(action) || "DELETE_EVIDENCE".equals(action);
    }

    private void requireWorkerCreatedEvidence(UUID tenantId, UUID userId, UUID workOrderId, UUID documentId) {
        var ownsPhoto = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_photos
                    WHERE tenant_id = ? AND work_order_id = ? AND document_id = ? AND created_by = ?
                )
                """, Boolean.class, tenantId, workOrderId, documentId, userId));
        var ownsReceipt = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM audit_logs
                    WHERE tenant_id = ?
                      AND resource_type = 'WORK_ORDER'
                      AND resource_id = ?
                      AND action = 'WORKER_PURCHASE_RECEIPT_UPLOADED'
                      AND actor_user_id = ?
                      AND metadata ->> 'documentId' = ?
                )
                """, Boolean.class, tenantId, workOrderId, userId, documentId.toString()));
        if (!ownsPhoto && !ownsReceipt) {
            throw new ResourceNotFoundException("Uploaded evidence was not found for this worker.");
        }
    }

    private int photoCount(UUID tenantId, UUID workOrderId, String photoType) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_photos
                WHERE tenant_id = ? AND work_order_id = ? AND photo_type = ?
                """, Integer.class, tenantId, workOrderId, photoType);
        return count == null ? 0 : count;
    }

    private int workerPhotoCount(UUID tenantId, UUID workOrderId, UUID userId, String photoType) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_photos
                WHERE tenant_id = ? AND work_order_id = ? AND created_by = ? AND photo_type = ?
                """, Integer.class, tenantId, workOrderId, userId, photoType);
        return count == null ? 0 : count;
    }

    private int receiptCount(UUID tenantId, UUID workOrderId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM audit_logs al
                JOIN documents d ON d.id = (al.metadata ->> 'documentId')::uuid
                  AND d.tenant_id = al.tenant_id
                  AND d.owner_type = 'WORK_ORDER'
                  AND d.owner_id = al.resource_id
                WHERE al.tenant_id = ?
                  AND al.resource_type = 'WORK_ORDER'
                  AND al.resource_id = ?
                  AND al.action = 'WORKER_PURCHASE_RECEIPT_UPLOADED'
                  AND jsonb_exists(al.metadata, 'documentId')
                """, Integer.class, tenantId, workOrderId);
        return count == null ? 0 : count;
    }

    private void completeChecklist(UUID tenantId, WorkerRef worker, UUID userId, UUID workOrderId, UUID taskId, Instant actionAt) {
        if (taskId == null) {
            throw new BadRequestException("Checklist item is required.");
        }
        var task = checklistTask(tenantId, worker.id(), workOrderId, taskId);
        var updated = jdbcTemplate.update("""
                UPDATE work_order_tasks
                SET completed = true, completed_at = ?, completed_by = ?, task_status = 'COMPLETED', updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                  AND (assigned_worker_id IS NULL OR assigned_worker_id = ?)
                """, timestamp(actionAt), userId, userId, tenantId, workOrderId, taskId, worker.id());
        if (updated == 0) {
            throw new ResourceNotFoundException("Checklist item not found for this job.");
        }
        auditAction(tenantId, worker, workOrderId, "WORKER_CHECKLIST_COMPLETED", Map.of(
                "taskId", taskId.toString(),
                "taskLabel", task.label(),
                "phase", task.phase(),
                "actionAt", actionAt.toString()
        ));
    }

    private void completeWork(UUID tenantId, WorkerRef worker, UUID userId, UUID workOrderId, String note, Instant actionAt) {
        var remainingRequiredChecks = remainingRequiredChecklistCount(tenantId, worker.id(), workOrderId, "COMPLETION");
        if (remainingRequiredChecks > 0) {
            throw new BadRequestException("Complete all required completion checks before submitting this work order.");
        }
        if (workerPhotoCount(tenantId, workOrderId, worker.userId(), "AFTER") == 0) {
            throw new BadRequestException("Add at least one after photo before submitting this work order.");
        }
        var updatedAssignment = jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET assignment_status = 'COMPLETED'::work_order_assignment_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, userId, tenantId, workOrderId, worker.id());
        if (updatedAssignment == 0) {
            throw new BadRequestException("This worker assignment is already closed.");
        }
        endOpenTimeEntry(tenantId, worker.id(), workOrderId, userId, actionAt);

        var allAssignmentsCompleted = allWorkerAssignmentsCompleted(tenantId, workOrderId);
        var nextStatus = allAssignmentsCompleted ? "PENDING_COMPLETION" : "IN_PROGRESS";
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = ?::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND status NOT IN ('CANCELLED', 'COMPLETED', 'APPROVED')
                """, nextStatus, userId, tenantId, workOrderId);
        auditAction(tenantId, worker, workOrderId, "WORKER_COMPLETE_WORK", Map.of(
                "assignmentStatus", "COMPLETED",
                "workOrderStatus", nextStatus,
                "allAssignmentsCompleted", allAssignmentsCompleted,
                "actionAt", actionAt.toString(),
                "note", note == null ? "" : note
        ));
    }

    private void leaveEmergency(UUID tenantId, WorkerRef worker, UUID userId, UUID workOrderId, String note, Instant actionAt) {
        var reason = blankToNull(note);
        if (reason == null) {
            throw new BadRequestException("Emergency leave reason is required.");
        }
        var updated = jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET assignment_status = 'LEFT_EMERGENCY'::work_order_assignment_status,
                    released_at = ?, release_reason = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, timestamp(actionAt), reason, userId, tenantId, workOrderId, worker.id());
        if (updated == 0) {
            throw new BadRequestException("This assignment cannot be marked as emergency leave.");
        }
        endOpenTimeEntry(tenantId, worker.id(), workOrderId, userId, actionAt);
        var activeWorkersRemaining = activeWorkerAssignmentsCount(tenantId, workOrderId);
        var nextStatus = activeWorkersRemaining == 0 ? "ON_HOLD" : "IN_PROGRESS";
        jdbcTemplate.update("""
                UPDATE work_orders
                SET status = ?::work_order_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND status NOT IN ('CANCELLED', 'COMPLETED', 'APPROVED')
                """, nextStatus, userId, tenantId, workOrderId);
        auditAction(tenantId, worker, workOrderId, "WORKER_LEFT_EMERGENCY", Map.of(
                "assignmentStatus", "LEFT_EMERGENCY",
                "workOrderStatus", nextStatus,
                "activeWorkersRemaining", activeWorkersRemaining,
                "reason", reason,
                "actionAt", actionAt.toString()
        ));
    }

    private void addMaterialUsed(
            UUID tenantId,
            WorkerRef worker,
            UUID userId,
            UUID workOrderId,
            WorkerJobActionRequest request,
            Instant actionAt
    ) {
        if (request.materialId() != null) {
            markExistingMaterialUsed(tenantId, worker, userId, workOrderId, request.materialId(), request.note(), actionAt);
            return;
        }
        if (request.quantity() == null || request.quantity().signum() <= 0) {
            throw new BadRequestException("Material quantity must be greater than zero.");
        }
        var itemName = inventoryItemName(tenantId, request.inventoryItemId());
        var description = blankToNull(request.materialDescription());
        if (description == null && itemName == null) {
            throw new BadRequestException("Material description is required.");
        }
        jdbcTemplate.update("""
                INSERT INTO work_order_materials (
                    tenant_id, work_order_id, inventory_item_id, description, quantity, unit_cost,
                    used, used_at, used_by, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, true, ?, ?, ?, ?)
                """,
                tenantId,
                workOrderId,
                request.inventoryItemId(),
                description == null ? itemName : description,
                request.quantity(),
                request.unitCost(),
                timestamp(actionAt),
                userId,
                userId,
                userId
        );
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("inventoryItemId", request.inventoryItemId() == null ? null : request.inventoryItemId().toString());
        metadata.put("description", description == null ? itemName : description);
        metadata.put("quantity", request.quantity());
        metadata.put("actionAt", actionAt.toString());
        auditAction(tenantId, worker, workOrderId, "WORKER_MATERIAL_USED", metadata);
    }

    private void markExistingMaterialUsed(
            UUID tenantId,
            WorkerRef worker,
            UUID userId,
            UUID workOrderId,
            UUID materialId,
            String note,
            Instant actionAt
    ) {
        var material = jdbcTemplate.query("""
                SELECT wom.inventory_item_id, ii.name AS item_name, wom.description, wom.quantity, ii.unit
                FROM work_order_materials wom
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE wom.tenant_id = ? AND wom.work_order_id = ? AND wom.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Planned material not found for this job.");
            }
            return Map.of(
                    "inventoryItemId", rs.getObject("inventory_item_id", UUID.class) == null ? "" : rs.getObject("inventory_item_id", UUID.class).toString(),
                    "description", rs.getString("description") == null ? "" : rs.getString("description"),
                    "itemName", rs.getString("item_name") == null ? "" : rs.getString("item_name"),
                    "quantity", rs.getBigDecimal("quantity"),
                    "unit", rs.getString("unit") == null ? "" : rs.getString("unit")
            );
        }, tenantId, workOrderId, materialId);
        jdbcTemplate.update("""
                UPDATE work_order_materials
                SET used = true, used_at = ?, used_by = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                """, timestamp(actionAt), userId, userId, tenantId, workOrderId, materialId);
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("materialId", materialId.toString());
        metadata.put("inventoryItemId", material.get("inventoryItemId"));
        metadata.put("description", material.get("description"));
        metadata.put("itemName", material.get("itemName"));
        metadata.put("quantity", material.get("quantity"));
        metadata.put("unit", material.get("unit"));
        metadata.put("note", note == null ? "" : note);
        metadata.put("actionAt", actionAt.toString());
        auditAction(tenantId, worker, workOrderId, "WORKER_MATERIAL_USED", metadata);
    }

    private void recordToolReturn(UUID tenantId, WorkerRef worker, UUID userId, UUID workOrderId, UUID assetId, String note, Instant actionAt) {
        if (assetId == null) {
            throw new BadRequestException("Tool or equipment is required.");
        }
        var updated = jdbcTemplate.update("""
                UPDATE work_order_assets
                SET released_at = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND asset_id = ? AND released_at IS NULL
                """, timestamp(actionAt), userId, tenantId, workOrderId, assetId);
        if (updated == 0) {
            throw new ResourceNotFoundException("Tool or equipment is not assigned to this job.");
        }
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("assetId", assetId.toString());
        metadata.put("note", note == null ? "" : note);
        metadata.put("actionAt", actionAt.toString());
        auditAction(tenantId, worker, workOrderId, "WORKER_TOOL_RETURNED", metadata);
    }

    private void recordPhoto(UUID tenantId, WorkerRef worker, UUID workOrderId, WorkerJobActionRequest request, Instant actionAt) {
        if (request.documentId() == null) {
            throw new BadRequestException("Uploaded photo document is required.");
        }
        documentStorageService.requireWorkOrderDocument(tenantId, workOrderId, request.documentId());
        var photoType = blankToNull(request.photoType()) == null ? "OTHER" : request.photoType().trim().toUpperCase();
        requireEvidenceLimitAvailable(tenantId, workOrderId, "WORK_PHOTO", photoType);
        var caption = blankToNull(request.caption()) == null ? "" : request.caption().trim();
        jdbcTemplate.update("""
                INSERT INTO work_order_photos (
                    tenant_id, work_order_id, document_id, photo_type, caption, captured_at, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                tenantId,
                workOrderId,
                request.documentId(),
                photoType,
                caption,
                timestamp(actionAt),
                worker.userId(),
                worker.userId()
        );
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("documentId", request.documentId().toString());
        metadata.put("photoType", photoType);
        metadata.put("caption", caption);
        metadata.put("actionAt", actionAt.toString());
        auditAction(tenantId, worker, workOrderId, "WORKER_PHOTO_CAPTURED", metadata);
    }

    private void recordPurchaseReceipt(UUID tenantId, WorkerRef worker, UUID workOrderId, WorkerJobActionRequest request, Instant actionAt) {
        if (request.documentId() == null) {
            throw new BadRequestException("Uploaded receipt or invoice document is required.");
        }
        documentStorageService.requireWorkOrderDocument(tenantId, workOrderId, request.documentId());
        requireEvidenceLimitAvailable(tenantId, workOrderId, "PURCHASE_RECEIPT", null);
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("documentId", request.documentId().toString());
        metadata.put("vendorName", blankToNull(request.vendorName()) == null ? "" : request.vendorName().trim());
        metadata.put("receiptAmount", request.receiptAmount());
        metadata.put("caption", blankToNull(request.caption()) == null ? "" : request.caption().trim());
        metadata.put("actionAt", actionAt.toString());
        auditAction(tenantId, worker, workOrderId, "WORKER_PURCHASE_RECEIPT_UPLOADED", metadata);
    }

    private void recordNote(UUID tenantId, WorkerRef worker, UUID workOrderId, String note, Instant actionAt) {
        if (blankToNull(note) == null) {
            throw new BadRequestException("Note is required.");
        }
        var noteId = jdbcTemplate.queryForObject("""
                INSERT INTO work_order_field_notes (
                    tenant_id, work_order_id, worker_id, note, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, tenantId, workOrderId, worker.id(), note.trim(), worker.userId(), worker.userId());
        auditAction(tenantId, worker, workOrderId, "WORKER_NOTE_ADDED", Map.of(
                "noteId", noteId.toString(),
                "note", note.trim(),
                "actionAt", actionAt.toString()
        ));
    }

    private void updateNote(UUID tenantId, WorkerRef worker, UUID workOrderId, UUID noteId, String note, Instant actionAt) {
        if (noteId == null) {
            throw new BadRequestException("Field note is required.");
        }
        if (blankToNull(note) == null) {
            throw new BadRequestException("Note is required.");
        }
        var updated = jdbcTemplate.update("""
                UPDATE work_order_field_notes
                SET note = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND id = ? AND created_by = ?
                """, note.trim(), worker.userId(), tenantId, workOrderId, noteId, worker.userId());
        if (updated == 0) {
            throw new ResourceNotFoundException("Editable field note not found.");
        }
        auditAction(tenantId, worker, workOrderId, "WORKER_NOTE_UPDATED", Map.of(
                "noteId", noteId.toString(),
                "note", note.trim(),
                "actionAt", actionAt.toString()
        ));
    }

    private void startTimeEntry(UUID tenantId, WorkerRef worker, UUID workOrderId, UUID userId, Instant now) {
        var hasOpen = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_time_entries
                    WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ? AND ended_at IS NULL
                )
                """, Boolean.class, tenantId, workOrderId, worker.id()));
        if (hasOpen) {
            return;
        }
        jdbcTemplate.update("""
                INSERT INTO work_order_time_entries (tenant_id, work_order_id, worker_id, entry_type, started_at, created_by, updated_by)
                VALUES (?, ?, ?, 'WORK', ?, ?, ?)
                """, tenantId, workOrderId, worker.id(), timestamp(now), userId, userId);
    }

    private void endOpenTimeEntry(UUID tenantId, UUID workerId, UUID workOrderId, UUID userId, Instant now) {
        jdbcTemplate.update("""
                UPDATE work_order_time_entries
                SET ended_at = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND work_order_id = ? AND worker_id = ? AND ended_at IS NULL
                """, timestamp(now), userId, tenantId, workOrderId, workerId);
    }

    private int remainingRequiredChecklistCount(UUID tenantId, UUID workerId, UUID workOrderId, String phase) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_tasks
                WHERE tenant_id = ?
                  AND work_order_id = ?
                  AND checklist_phase = ?::work_order_task_phase
                  AND required = true
                  AND completed = false
                  AND (assigned_worker_id IS NULL OR assigned_worker_id = ?)
                """, Integer.class, tenantId, workOrderId, phase, workerId);
        return count == null ? 0 : count;
    }

    private ChecklistTaskRef checklistTask(UUID tenantId, UUID workerId, UUID workOrderId, UUID taskId) {
        return jdbcTemplate.query("""
                SELECT label, checklist_phase::text AS phase
                FROM work_order_tasks
                WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                  AND (assigned_worker_id IS NULL OR assigned_worker_id = ?)
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Checklist item not found for this job.");
            }
            return new ChecklistTaskRef(rs.getString("label"), rs.getString("phase"));
        }, tenantId, workOrderId, taskId, workerId);
    }

    private boolean allWorkerAssignmentsCompleted(UUID tenantId, UUID workOrderId) {
        var remaining = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_assignments
                WHERE tenant_id = ?
                  AND work_order_id = ?
                  AND assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')
                """, Integer.class, tenantId, workOrderId);
        return remaining == null || remaining == 0;
    }

    private int activeWorkerAssignmentsCount(UUID tenantId, UUID workOrderId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_assignments
                WHERE tenant_id = ?
                  AND work_order_id = ?
                  AND assignment_status IN ('ASSIGNED', 'ACCEPTED', 'ON_SITE', 'IN_PROGRESS', 'PAUSED')
                """, Integer.class, tenantId, workOrderId);
        return count == null ? 0 : count;
    }

    private WorkerAssignedJobDto job(UUID tenantId, WorkerRef worker, UUID workOrderId) {
        var jobs = jdbcTemplate.query("""
                SELECT wo.id, wo.work_order_number, wo.title, p.name AS property_name, c.display_name AS owner_name,
                       concat_ws(', ', p.address_line1, nullif(p.address_line2, ''), p.city, p.province_code, p.postal_code) AS address,
                       st.name AS service_name, wo.status::text AS status, wo.priority::text AS priority,
                       wo.scheduled_start, wo.scheduled_end, wo.description AS notes,
                       woa.lead_worker, woa.assignment_status::text AS assignment_status
                FROM work_order_assignments woa
                JOIN work_orders wo ON wo.id = woa.work_order_id AND wo.tenant_id = woa.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                JOIN customers c ON c.id = wo.customer_id AND c.tenant_id = wo.tenant_id
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                WHERE woa.tenant_id = ? AND woa.worker_id = ? AND wo.id = ?
                """, (rs, rowNum) -> new WorkerAssignedJobDto(
                rs.getObject("id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("title"),
                rs.getString("property_name"),
                rs.getString("owner_name"),
                rs.getString("address"),
                rs.getString("service_name"),
                rs.getString("status"),
                rs.getString("priority"),
                instant("scheduled_start", rs),
                instant("scheduled_end", rs),
                rs.getString("notes"),
                rs.getBoolean("lead_worker"),
                rs.getString("assignment_status"),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of(),
                List.of()
        ), tenantId, worker.id(), workOrderId);
        return jobs.stream().findFirst()
                .map(job -> jobWithDetails(tenantId, worker.id(), worker.userId(), job))
                .orElseThrow(() -> new ResourceNotFoundException("Assigned job not found."));
    }

    private WorkerAssignedJobDto jobWithDetails(UUID tenantId, UUID workerId, UUID actorUserId, WorkerAssignedJobDto job) {
        return new WorkerAssignedJobDto(
                job.id(),
                job.workOrderNumber(),
                job.title(),
                job.propertyName(),
                job.ownerName(),
                job.address(),
                job.serviceName(),
                job.status(),
                job.priority(),
                job.scheduledStart(),
                job.scheduledEnd(),
                job.notes(),
                job.leadWorker(),
                job.assignmentStatus(),
                checklist(tenantId, workerId, job.id()),
                materials(tenantId, job.id()),
                assets(tenantId, job.id()),
                fieldNotes(tenantId, actorUserId, job.id()),
                evidence(tenantId, actorUserId, job.id()),
                executionEvents(tenantId, job.id())
        );
    }

    private List<WorkerAssignedJobDto.ChecklistItemDto> checklist(UUID tenantId, UUID workerId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT id, label, checklist_phase::text AS checklist_phase, required, completed, task_status::text AS task_status
                FROM work_order_tasks
                WHERE tenant_id = ?
                  AND work_order_id = ?
                  AND (assigned_worker_id IS NULL OR assigned_worker_id = ?)
                ORDER BY sort_order, label
                """, (rs, rowNum) -> new WorkerAssignedJobDto.ChecklistItemDto(
                rs.getObject("id", UUID.class),
                rs.getString("label"),
                rs.getString("checklist_phase"),
                rs.getBoolean("required"),
                rs.getBoolean("completed"),
                rs.getString("task_status")
        ), tenantId, workOrderId, workerId);
    }

    private List<WorkerAssignedJobDto.MaterialDto> materials(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT wom.id, wom.inventory_item_id, ii.name AS item_name, wom.description, wom.quantity, ii.unit, wom.used, wom.used_at
                FROM work_order_materials wom
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE wom.tenant_id = ? AND wom.work_order_id = ?
                ORDER BY wom.created_at, wom.description
                """, (rs, rowNum) -> new WorkerAssignedJobDto.MaterialDto(
                rs.getObject("id", UUID.class),
                rs.getObject("inventory_item_id", UUID.class),
                rs.getString("item_name"),
                rs.getString("description"),
                rs.getBigDecimal("quantity"),
                rs.getString("unit"),
                rs.getBoolean("used"),
                instant("used_at", rs)
        ), tenantId, workOrderId);
    }

    private List<WorkerAssignedJobDto.AssetDto> assets(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT a.id, a.asset_type, a.name, a.identifier
                FROM work_order_assets woa
                JOIN assets a ON a.id = woa.asset_id AND a.tenant_id = woa.tenant_id
                WHERE woa.tenant_id = ? AND woa.work_order_id = ? AND woa.released_at IS NULL
                ORDER BY a.asset_type, a.name
                """, (rs, rowNum) -> new WorkerAssignedJobDto.AssetDto(
                rs.getObject("id", UUID.class),
                rs.getString("asset_type"),
                rs.getString("name"),
                rs.getString("identifier")
        ), tenantId, workOrderId);
    }

    private List<WorkerAssignedJobDto.FieldNoteDto> fieldNotes(UUID tenantId, UUID actorUserId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT wofn.id, wofn.note, coalesce(w.display_name, au.display_name, 'Field worker') AS worker_name,
                       wofn.created_at, wofn.updated_at, wofn.created_by
                FROM work_order_field_notes wofn
                LEFT JOIN workers w ON w.id = wofn.worker_id AND w.tenant_id = wofn.tenant_id
                LEFT JOIN app_users au ON au.id = wofn.created_by
                WHERE wofn.tenant_id = ? AND wofn.work_order_id = ?
                ORDER BY wofn.created_at DESC
                """, (rs, rowNum) -> new WorkerAssignedJobDto.FieldNoteDto(
                rs.getObject("id", UUID.class),
                rs.getString("note"),
                rs.getString("worker_name"),
                instant("created_at", rs),
                instant("updated_at", rs),
                actorUserId.equals(rs.getObject("created_by", UUID.class))
        ), tenantId, workOrderId);
    }

    private List<WorkerAssignedJobDto.EvidenceDto> evidence(UUID tenantId, UUID actorUserId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT *
                FROM (
                    SELECT d.id AS document_id, 'WORK_PHOTO' AS document_type, wop.photo_type, wop.caption,
                           d.bucket, d.object_key, d.content_type, d.byte_size,
                           coalesce(au.display_name, 'Field worker') AS created_by_name,
                           wop.created_at,
                           (wop.created_by = ?) AS can_delete
                    FROM work_order_photos wop
                    JOIN documents d ON d.id = wop.document_id AND d.tenant_id = wop.tenant_id
                    LEFT JOIN app_users au ON au.id = wop.created_by
                    WHERE wop.tenant_id = ? AND wop.work_order_id = ?
                    UNION ALL
                    SELECT d.id AS document_id, 'PURCHASE_RECEIPT' AS document_type, NULL::text AS photo_type,
                           coalesce(al.metadata ->> 'caption', al.metadata ->> 'vendorName', '') AS caption,
                           d.bucket, d.object_key, d.content_type, d.byte_size,
                           coalesce(au.display_name, 'Field worker') AS created_by_name,
                           al.created_at,
                           (al.actor_user_id = ?) AS can_delete
                    FROM audit_logs al
                    JOIN documents d ON d.id = (al.metadata ->> 'documentId')::uuid
                      AND d.tenant_id = al.tenant_id
                      AND d.owner_type = 'WORK_ORDER'
                      AND d.owner_id = al.resource_id
                    LEFT JOIN app_users au ON au.id = al.actor_user_id
                    WHERE al.tenant_id = ?
                      AND al.resource_type = 'WORK_ORDER'
                      AND al.resource_id = ?
                      AND al.action = 'WORKER_PURCHASE_RECEIPT_UPLOADED'
                      AND jsonb_exists(al.metadata, 'documentId')
                ) evidence
                ORDER BY created_at DESC
                """, (rs, rowNum) -> new WorkerAssignedJobDto.EvidenceDto(
                rs.getObject("document_id", UUID.class),
                rs.getString("document_type"),
                rs.getString("photo_type"),
                rs.getString("caption"),
                documentStorageService.createReadUrl(rs.getString("bucket"), rs.getString("object_key")),
                rs.getString("content_type"),
                (Long) rs.getObject("byte_size"),
                rs.getString("created_by_name"),
                instant("created_at", rs),
                rs.getBoolean("can_delete")
        ), actorUserId, tenantId, workOrderId, actorUserId, tenantId, workOrderId);
    }

    private List<WorkerAssignedJobDto.ExecutionEventDto> executionEvents(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                WITH ready_event AS (
                    SELECT 'WORKER_READY' AS action,
                           NULL::text AS worker_name,
                           'Ready for field execution.' AS note,
                           COALESCE(MIN(woa.created_at), wo.created_at) AS created_at
                    FROM work_orders wo
                    LEFT JOIN work_order_assignments woa
                      ON woa.tenant_id = wo.tenant_id AND woa.work_order_id = wo.id
                    WHERE wo.tenant_id = ? AND wo.id = ?
                    GROUP BY wo.created_at
                ),
                worker_events AS (
                    SELECT action,
                           metadata ->> 'workerName' AS worker_name,
                           COALESCE(
                               NULLIF(metadata ->> 'note', ''),
                               NULLIF(metadata ->> 'reason', ''),
                               NULLIF(metadata ->> 'taskLabel', ''),
                               NULLIF(metadata ->> 'description', ''),
                               NULLIF(metadata ->> 'itemName', ''),
                               NULLIF(metadata ->> 'caption', ''),
                               NULLIF(metadata ->> 'vendorName', ''),
                               NULLIF(metadata ->> 'label', '')
                           ) AS note,
                           created_at
                    FROM audit_logs
                    WHERE tenant_id = ?
                      AND resource_type = 'WORK_ORDER'
                      AND resource_id = ?
                      AND action IN (
                        'WORKER_VIEWED_DISPATCH',
                        'WORKER_VIEWED_PRE_START_CHECKLIST',
                        'WORKER_VIEWED_COMPLETION_CHECKLIST',
                        'WORKER_VIEWED_TIMELINE',
                        'WORKER_START_TRAVEL',
                        'WORKER_ARRIVE_ON_SITE',
                        'WORKER_START_WORK',
                        'WORKER_PAUSE_WORK',
                        'WORKER_RESUME_WORK',
                        'WORKER_CHECKLIST_COMPLETED',
                        'WORKER_MATERIAL_USED',
                        'WORKER_TOOL_RETURNED',
                        'WORKER_PHOTO_CAPTURED',
                        'WORKER_PURCHASE_RECEIPT_UPLOADED',
                        'WORKER_EVIDENCE_DELETED',
                        'WORKER_NOTE_ADDED',
                        'WORKER_NOTE_UPDATED',
                        'WORKER_COMPLETE_WORK',
                        'WORKER_LEFT_EMERGENCY'
                      )
                )
                SELECT action, worker_name, note, created_at
                FROM ready_event
                UNION ALL
                SELECT action, worker_name, note, created_at
                FROM worker_events
                ORDER BY created_at
                """, (rs, rowNum) -> {
            var action = rs.getString("action");
            return new WorkerAssignedJobDto.ExecutionEventDto(
                    action,
                    executionLabel(action),
                    rs.getString("worker_name"),
                    instant("created_at", rs),
                    rs.getString("note")
            );
        }, tenantId, workOrderId, tenantId, workOrderId);
    }

    private String executionLabel(String action) {
        return switch (action) {
            case "WORKER_READY" -> "Ready";
            case "WORKER_VIEWED_DISPATCH" -> "Viewed dispatch";
            case "WORKER_VIEWED_PRE_START_CHECKLIST" -> "Viewed pre-start checklist";
            case "WORKER_VIEWED_COMPLETION_CHECKLIST" -> "Viewed completion checklist";
            case "WORKER_VIEWED_TIMELINE" -> "Viewed timeline";
            case "WORKER_START_TRAVEL" -> "Travel started";
            case "WORKER_ARRIVE_ON_SITE" -> "Arrived on site";
            case "WORKER_START_WORK" -> "Work started";
            case "WORKER_PAUSE_WORK" -> "Work paused";
            case "WORKER_RESUME_WORK" -> "Work resumed";
            case "WORKER_CHECKLIST_COMPLETED" -> "Checklist completed";
            case "WORKER_MATERIAL_USED" -> "Material used";
            case "WORKER_TOOL_RETURNED" -> "Tool returned";
            case "WORKER_PHOTO_CAPTURED" -> "Photo added";
            case "WORKER_PURCHASE_RECEIPT_UPLOADED" -> "Receipt uploaded";
            case "WORKER_EVIDENCE_DELETED" -> "Evidence deleted";
            case "WORKER_NOTE_ADDED" -> "Note added";
            case "WORKER_NOTE_UPDATED" -> "Note updated";
            case "WORKER_COMPLETE_WORK" -> "Submitted work";
            case "WORKER_LEFT_EMERGENCY" -> "Emergency leave";
            default -> "Timeline updated";
        };
    }

    private WorkerRef worker(UUID tenantId, UUID userId, String email) {
        return jdbcTemplate.query("""
                SELECT id, user_id, display_name, email
                FROM workers
                WHERE tenant_id = ? AND status = 'ACTIVE'
                  AND (user_id = ? OR lower(email::text) = lower(?))
                ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
                LIMIT 1
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Worker profile is not linked to this login.");
            }
            return new WorkerRef(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class) == null ? userId : rs.getObject("user_id", UUID.class),
                    rs.getString("display_name"),
                    rs.getString("email")
            );
        }, tenantId, userId, email, userId);
    }

    private void requireAssigned(UUID tenantId, UUID workerId, UUID workOrderId) {
        var assigned = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_assignments woa
                    JOIN work_orders wo ON wo.id = woa.work_order_id AND wo.tenant_id = woa.tenant_id
                    WHERE woa.tenant_id = ? AND woa.worker_id = ? AND woa.work_order_id = ?
                      AND wo.status NOT IN ('CANCELLED', 'APPROVED')
                      AND woa.assignment_status NOT IN ('DECLINED', 'RELEASED', 'LEFT_EMERGENCY')
                )
                """, Boolean.class, tenantId, workerId, workOrderId));
        if (!assigned) {
            throw new ResourceNotFoundException("Assigned job not found.");
        }
    }

    private String inventoryItemName(UUID tenantId, UUID inventoryItemId) {
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
            return rs.getString("name");
        }, tenantId, inventoryItemId);
    }

    private ZoneId tenantZoneId(UUID tenantId) {
        var timezone = jdbcTemplate.queryForObject("SELECT timezone FROM tenants WHERE id = ?", String.class, tenantId);
        return ZoneId.of(timezone == null || timezone.isBlank() ? "America/Toronto" : timezone);
    }

    private void auditAction(UUID tenantId, WorkerRef worker, UUID workOrderId, String action, Map<String, ?> detail) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workerId", worker.id().toString());
        metadata.put("workerName", worker.displayName());
        metadata.put("workerEmail", worker.email());
        metadata.putAll(detail);
        metadata.putAll(actionMetadata());
        auditWriter.record(tenantId, worker.userId(), action, "WORK_ORDER", workOrderId, metadata);
    }

    private Map<String, Object> actionMetadata() {
        var request = actionRequestContext.get();
        if (request == null) {
            return Map.of();
        }
        var metadata = new LinkedHashMap<String, Object>();
        putIfPresent(metadata, "latitude", request.latitude());
        putIfPresent(metadata, "longitude", request.longitude());
        putIfPresent(metadata, "locationAccuracyMeters", request.locationAccuracyMeters());
        putIfPresent(metadata, "deviceTimestamp", blankToNull(request.deviceTimestamp()));
        putIfPresent(metadata, "platform", blankToNull(request.platform()));
        putIfPresent(metadata, "userAgent", truncate(blankToNull(request.userAgent()), 512));
        return metadata;
    }

    private void putIfPresent(Map<String, Object> metadata, String key, Object value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private String normalizeAction(String action) {
        if (action == null || action.isBlank()) {
            throw new BadRequestException("Worker action is required.");
        }
        return action.trim().toUpperCase();
    }

    private boolean isViewAction(String action) {
        return Set.of(
                "VIEW_DISPATCH",
                "VIEW_PRE_START_CHECKLIST",
                "VIEW_COMPLETION_CHECKLIST",
                "VIEW_TIMELINE"
        ).contains(action);
    }

    private boolean terminalAssignmentStatus(String assignmentStatus) {
        return Set.of("COMPLETED", "RELEASED", "DECLINED", "LEFT_EMERGENCY").contains(assignmentStatus);
    }

    private String message(String action) {
        return switch (action) {
            case "VIEW_DISPATCH" -> "Dispatch view recorded.";
            case "VIEW_PRE_START_CHECKLIST" -> "Pre-start checklist view recorded.";
            case "VIEW_COMPLETION_CHECKLIST" -> "Completion checklist view recorded.";
            case "VIEW_TIMELINE" -> "Timeline view recorded.";
            case "START_TRAVEL" -> "Travel started.";
            case "ARRIVE_ON_SITE" -> "Marked on site.";
            case "START_WORK" -> "Work started.";
            case "PAUSE_WORK" -> "Work paused.";
            case "RESUME_WORK" -> "Work resumed.";
            case "COMPLETE_WORK" -> "Work submitted for review.";
            case "COMPLETE_CHECKLIST" -> "Checklist item completed.";
            case "ADD_MATERIAL_USED" -> "Material recorded.";
            case "RETURN_TOOL" -> "Tool return recorded.";
            case "LEAVE_EMERGENCY" -> "Emergency leave recorded. Operations can reassign the job.";
            case "ADD_PHOTO" -> "Photo note recorded.";
            case "ADD_PURCHASE_RECEIPT" -> "Purchase receipt uploaded.";
            case "ADD_NOTE" -> "Note added.";
            case "UPDATE_NOTE" -> "Note updated.";
            default -> "Action recorded.";
        };
    }

    private String auditActionName(String action) {
        return "WORKER_" + action;
    }

    private Instant instant(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record WorkerRef(UUID id, UUID userId, String displayName, String email) {
    }

    private record ChecklistTaskRef(String label, String phase) {
    }

    private record ActionGate(String status, Instant scheduledStart, String assignmentStatus) {
    }
}
