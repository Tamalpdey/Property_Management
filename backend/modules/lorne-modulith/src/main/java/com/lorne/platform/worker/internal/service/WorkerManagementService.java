package com.lorne.platform.worker.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.worker.internal.dto.CreateWorkerRequest;
import com.lorne.platform.worker.internal.dto.UpdateWorkerStatusRequest;
import com.lorne.platform.worker.internal.dto.WorkerActivityOverrideRequest;
import com.lorne.platform.worker.internal.dto.WorkerActivityDto;
import com.lorne.platform.worker.internal.dto.WorkerClockEntryDto;
import com.lorne.platform.worker.internal.dto.WorkerDto;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkerManagementService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public WorkerManagementService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<WorkerDto> list(UUID tenantId) {
        var emergencyContacts = emergencyContactsByWorker(tenantId);
        var certifications = certificationsByWorker(tenantId);
        var serviceSkills = serviceSkillsByWorker(tenantId);
        var shifts = shiftsByWorker(tenantId);
        return jdbcTemplate.query("""
                SELECT w.id, w.user_id, w.employee_number,
                       COALESCE(u.display_name, w.display_name) AS display_name,
                       COALESCE(u.phone, w.phone) AS phone,
                       COALESCE(u.email, w.email) AS email,
                       w.status, w.engagement_type::text AS engagement_type,
                       w.max_weekly_hours, w.hourly_rate, w.hire_date,
                       w.leave_start_date, w.leave_end_date, w.leave_reason
                FROM workers w
                LEFT JOIN app_users u ON u.id = w.user_id
                WHERE w.tenant_id = ?
                ORDER BY COALESCE(u.display_name, w.display_name)
                """, (rs, rowNum) -> new WorkerDto(
                rs.getObject("id", UUID.class),
                rs.getString("employee_number"),
                rs.getString("display_name"),
                rs.getString("phone"),
                rs.getString("email"),
                rs.getObject("user_id", UUID.class) != null,
                rs.getString("status"),
                rs.getString("engagement_type"),
                (Integer) rs.getObject("max_weekly_hours"),
                rs.getBigDecimal("hourly_rate"),
                rs.getObject("hire_date", java.time.LocalDate.class),
                rs.getObject("leave_start_date", java.time.LocalDate.class),
                rs.getObject("leave_end_date", java.time.LocalDate.class),
                rs.getString("leave_reason"),
                emergencyContacts.get(rs.getObject("id", UUID.class)),
                certifications.getOrDefault(rs.getObject("id", UUID.class), List.of()),
                serviceSkills.getOrDefault(rs.getObject("id", UUID.class), List.of()),
                shifts.getOrDefault(rs.getObject("id", UUID.class), List.of())
        ), tenantId);
    }

    @Transactional(readOnly = true)
    public List<WorkerClockEntryDto> clockEntries(UUID tenantId, UUID workerId, LocalDate from, LocalDate to) {
        requireWorker(tenantId, workerId);
        var fromDate = from == null ? LocalDate.now() : from;
        var toDate = to == null ? fromDate : to;
        if (toDate.isBefore(fromDate)) {
            throw new BadRequestException("Clock entry end date must be on or after start date.");
        }
        return jdbcTemplate.query("""
                SELECT wsce.id, wsce.worker_id, wsce.started_at, wsce.ended_at,
                       CASE WHEN wsce.ended_at IS NULL THEN NULL
                            ELSE floor(extract(epoch from (wsce.ended_at - wsce.started_at)) / 60)::bigint
                       END AS duration_minutes,
                       COALESCE(pauses.pause_minutes, 0)::bigint AS pause_minutes
                FROM worker_shift_clock_entries wsce
                JOIN tenants t ON t.id = wsce.tenant_id
                LEFT JOIN LATERAL (
                    SELECT floor(sum(extract(epoch from (ended_at - started_at))) / 60)::bigint AS pause_minutes
                    FROM worker_shift_clock_pauses wscp
                    WHERE wscp.tenant_id = wsce.tenant_id
                      AND wscp.worker_id = wsce.worker_id
                      AND wscp.shift_clock_entry_id = wsce.id
                      AND wscp.ended_at IS NOT NULL
                ) pauses ON true
                WHERE wsce.tenant_id = ?
                  AND wsce.worker_id = ?
                  AND (wsce.started_at AT TIME ZONE COALESCE(t.timezone, 'America/Toronto'))::date <= ?
                  AND (COALESCE(wsce.ended_at, now()) AT TIME ZONE COALESCE(t.timezone, 'America/Toronto'))::date >= ?
                ORDER BY wsce.started_at
                """, (rs, rowNum) -> new WorkerClockEntryDto(
                rs.getObject("id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                instant("started_at", rs),
                instant("ended_at", rs),
                (Long) rs.getObject("duration_minutes"),
                (Long) rs.getObject("pause_minutes")
        ), tenantId, workerId, toDate, fromDate);
    }

    @Transactional(readOnly = true)
    public List<WorkerActivityDto> activities(UUID tenantId, UUID workerId, LocalDate from, LocalDate to) {
        requireWorker(tenantId, workerId);
        var fromDate = from == null ? LocalDate.now() : from;
        var toDate = to == null ? fromDate : to;
        if (toDate.isBefore(fromDate)) {
            throw new BadRequestException("Activity end date must be on or after start date.");
        }
        return jdbcTemplate.query("""
                SELECT worker_daily_activities.id, worker_daily_activities.worker_id, worker_daily_activities.activity_type,
                       worker_daily_activities.title, worker_daily_activities.location_name, worker_daily_activities.address,
                       worker_daily_activities.notes, worker_daily_activities.started_at, worker_daily_activities.ended_at,
                       CASE WHEN worker_daily_activities.ended_at IS NULL THEN NULL
                            ELSE floor(extract(epoch from (worker_daily_activities.ended_at - worker_daily_activities.started_at)) / 60)::bigint
                       END AS duration_minutes,
                       override_audit.reason AS override_reason,
                       override_audit.created_at AS override_updated_at
                FROM worker_daily_activities
                LEFT JOIN LATERAL (
                    SELECT audit_logs.metadata ->> 'reason' AS reason, audit_logs.created_at
                    FROM audit_logs
                    WHERE audit_logs.tenant_id = worker_daily_activities.tenant_id
                      AND audit_logs.resource_type = 'WORKER'
                      AND audit_logs.resource_id = worker_daily_activities.worker_id
                      AND audit_logs.action = 'WORKER_ACTIVITY_OVERRIDDEN'
                      AND audit_logs.metadata ->> 'activityId' = worker_daily_activities.id::text
                    ORDER BY audit_logs.created_at DESC
                    LIMIT 1
                ) override_audit ON true
                WHERE worker_daily_activities.tenant_id = ?
                  AND worker_daily_activities.worker_id = ?
                  AND worker_daily_activities.activity_date >= ?
                  AND worker_daily_activities.activity_date <= ?
                ORDER BY worker_daily_activities.started_at
                """, (rs, rowNum) -> new WorkerActivityDto(
                rs.getObject("id", UUID.class),
                rs.getObject("worker_id", UUID.class),
                rs.getString("activity_type"),
                rs.getString("title"),
                rs.getString("location_name"),
                rs.getString("address"),
                rs.getString("notes"),
                instant("started_at", rs),
                instant("ended_at", rs),
                (Long) rs.getObject("duration_minutes"),
                rs.getTimestamp("ended_at") == null,
                rs.getTimestamp("override_updated_at") != null,
                rs.getString("override_reason"),
                instant("override_updated_at", rs)
        ), tenantId, workerId, fromDate, toDate);
    }

    @Transactional
    public List<WorkerActivityDto> overrideActivity(UUID tenantId, UUID actorUserId, UUID workerId, WorkerActivityOverrideRequest request) {
        requireWorker(tenantId, workerId);
        if (request == null) {
            throw new BadRequestException("Worker activity override details are required.");
        }
        var reason = blankToNull(request.reason());
        if (reason == null) {
            throw new BadRequestException("Override reason is required.");
        }
        var previous = request.activityId() == null ? null : activitySnapshot(tenantId, workerId, request.activityId());
        var affectedDate = previous == null ? null : previous.activityDate();
        if (Boolean.TRUE.equals(request.delete())) {
            if (request.activityId() == null) {
                throw new BadRequestException("Activity id is required to delete a worker activity.");
            }
            var deleted = jdbcTemplate.update("""
                    DELETE FROM worker_daily_activities
                    WHERE tenant_id = ? AND worker_id = ? AND id = ?
                    """, tenantId, workerId, request.activityId());
            if (deleted != 1) {
                throw new ResourceNotFoundException("Worker activity was not found.");
            }
            auditWriter.record(tenantId, actorUserId, "WORKER_ACTIVITY_OVERRIDE_DELETED", "WORKER", workerId, activityOverrideMetadata(
                    request.activityId(), "DELETE", previous, request, reason
            ));
            var date = affectedDate == null ? LocalDate.now(tenantZoneId(tenantId)) : affectedDate;
            return activities(tenantId, workerId, date, date);
        }

        var startedAt = request.startedAt();
        var endedAt = request.endedAt();
        if (startedAt == null || endedAt == null) {
            throw new BadRequestException("Activity start and end time are required for operations override.");
        }
        if (!endedAt.isAfter(startedAt)) {
            throw new BadRequestException("Activity end time must be after start time.");
        }
        var title = blankToNull(request.title());
        if (title == null) {
            throw new BadRequestException("Activity title is required.");
        }
        var activityType = activityType(request.activityType());
        var activityDate = startedAt.atZone(tenantZoneId(tenantId)).toLocalDate();
        UUID activityId;
        String action;
        if (request.activityId() == null) {
            activityId = jdbcTemplate.queryForObject("""
                    INSERT INTO worker_daily_activities (
                        tenant_id, worker_id, activity_date, activity_type, title, location_name,
                        address, notes, started_at, ended_at, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    workerId,
                    activityDate,
                    activityType,
                    title,
                    blankToNull(request.locationName()),
                    blankToNull(request.address()),
                    blankToNull(request.notes()),
                    timestamp(startedAt),
                    timestamp(endedAt),
                    actorUserId,
                    actorUserId
            );
            action = "CREATE";
        } else {
            activityId = request.activityId();
            var updated = jdbcTemplate.update("""
                    UPDATE worker_daily_activities
                    SET activity_date = ?,
                        activity_type = ?,
                        title = ?,
                        location_name = ?,
                        address = ?,
                        notes = ?,
                        started_at = ?,
                        ended_at = ?,
                        updated_by = ?,
                        updated_at = now()
                    WHERE tenant_id = ? AND worker_id = ? AND id = ?
                    """,
                    activityDate,
                    activityType,
                    title,
                    blankToNull(request.locationName()),
                    blankToNull(request.address()),
                    blankToNull(request.notes()),
                    timestamp(startedAt),
                    timestamp(endedAt),
                    actorUserId,
                    tenantId,
                    workerId,
                    activityId
            );
            if (updated != 1) {
                throw new ResourceNotFoundException("Worker activity was not found.");
            }
            action = "UPDATE";
        }
        auditWriter.record(tenantId, actorUserId, "WORKER_ACTIVITY_OVERRIDDEN", "WORKER", workerId, activityOverrideMetadata(
                activityId, action, previous, request, reason
        ));
        return activities(tenantId, workerId, activityDate, activityDate);
    }

    @Transactional
    public WorkerDto create(UUID tenantId, UUID actorUserId, CreateWorkerRequest request) {
        try {
            var workerId = jdbcTemplate.queryForObject("""
                    INSERT INTO workers (
                        tenant_id, employee_number, display_name, phone, email, status, engagement_type,
                        max_weekly_hours, hourly_rate, hire_date, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?::worker_engagement_type, ?, ?, ?, ?, ?)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    blankToNull(request.employeeNumber()),
                    request.displayName(),
                    blankToNull(request.phone()),
                    blankToNull(request.email()),
                    engagementType(request.engagementType()),
                    request.maxWeeklyHours(),
                    request.hourlyRate(),
                    request.hireDate(),
                    actorUserId,
                    actorUserId
            );
            createEmergencyContact(tenantId, workerId, request.emergencyContact());
            createCertifications(tenantId, workerId, request.certifications());
            createServiceSkills(tenantId, workerId, actorUserId, request.serviceTypeIds());
            createShifts(tenantId, workerId, actorUserId, request.shifts());
            auditWriter.record(tenantId, actorUserId, "WORKER_CREATED", "WORKER", workerId, Map.of(
                    "displayName", request.displayName(),
                    "employeeNumber", request.employeeNumber() == null ? "" : request.employeeNumber(),
                    "engagementType", engagementType(request.engagementType()),
                    "maxWeeklyHours", request.maxWeeklyHours() == null ? "" : request.maxWeeklyHours(),
                    "hasEmergencyContact", request.emergencyContact() != null,
                    "certificationCount", request.certifications() == null ? 0 : request.certifications().size(),
                    "serviceSkillCount", request.serviceTypeIds() == null ? 0 : request.serviceTypeIds().stream().distinct().count(),
                    "shiftCount", request.shifts() == null ? 0 : request.shifts().size()
            ));
            return list(tenantId).stream()
                    .filter(worker -> worker.id().equals(workerId))
                    .findFirst()
                    .orElseThrow();
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Worker employee number already exists.");
        }
    }

    @Transactional
    public WorkerDto update(UUID tenantId, UUID actorUserId, UUID workerId, CreateWorkerRequest request) {
        requireWorker(tenantId, workerId);
        try {
            var updated = jdbcTemplate.update("""
                    UPDATE workers
                    SET employee_number = ?, display_name = ?, phone = ?, email = ?,
                        engagement_type = ?::worker_engagement_type, max_weekly_hours = ?, hourly_rate = ?, hire_date = ?,
                        updated_at = now(), updated_by = ?
                    WHERE tenant_id = ? AND id = ?
                    """,
                    blankToNull(request.employeeNumber()),
                    request.displayName(),
                    blankToNull(request.phone()),
                    blankToNull(request.email()),
                    engagementType(request.engagementType()),
                    request.maxWeeklyHours(),
                    request.hourlyRate(),
                    request.hireDate(),
                    actorUserId,
                    tenantId,
                    workerId
            );
            if (updated != 1) {
                throw new ResourceNotFoundException("Worker not found.");
            }
            replaceEmergencyContact(tenantId, workerId, request.emergencyContact());
            replaceCertifications(tenantId, workerId, request.certifications());
            replaceServiceSkills(tenantId, workerId, actorUserId, request.serviceTypeIds());
            replaceShifts(tenantId, workerId, actorUserId, request.shifts());
            syncLinkedUserContact(tenantId, actorUserId, workerId, request.displayName(), blankToNull(request.phone()), blankToNull(request.email()));
            auditWriter.record(tenantId, actorUserId, "WORKER_UPDATED", "WORKER", workerId, Map.of(
                    "displayName", request.displayName(),
                    "employeeNumber", request.employeeNumber() == null ? "" : request.employeeNumber(),
                    "engagementType", engagementType(request.engagementType()),
                    "serviceSkillCount", request.serviceTypeIds() == null ? 0 : request.serviceTypeIds().stream().distinct().count(),
                    "shiftCount", request.shifts() == null ? 0 : request.shifts().size()
            ));
            return find(tenantId, workerId);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Worker employee number already exists.");
        }
    }

    @Transactional
    public WorkerDto updateStatus(UUID tenantId, UUID actorUserId, UUID workerId, UpdateWorkerStatusRequest request) {
        requireWorker(tenantId, workerId);
        var linkedUserId = linkedUserId(tenantId, workerId);
        var status = normalizeStatus(request.status());
        var leaveStartDate = request.leaveStartDate();
        var leaveEndDate = request.leaveEndDate();
        var leaveReason = blankToNull(request.leaveReason());
        if ("ON_LEAVE".equals(status)) {
            if (leaveStartDate == null || leaveEndDate == null) {
                throw new BadRequestException("Leave start and end dates are required.");
            }
            if (leaveEndDate.isBefore(leaveStartDate)) {
                throw new BadRequestException("Leave end date must be on or after leave start date.");
            }
        } else {
            leaveStartDate = null;
            leaveEndDate = null;
            leaveReason = null;
        }
        jdbcTemplate.update("""
                UPDATE workers
                SET status = ?::worker_status,
                    leave_start_date = ?,
                    leave_end_date = ?,
                    leave_reason = ?,
                    updated_at = now(),
                    updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, status, leaveStartDate, leaveEndDate, leaveReason, actorUserId, tenantId, workerId);
        if (!"ACTIVE".equals(status) && linkedUserId != null) {
            revokeWorkerRefreshSessions(linkedUserId, tenantId);
        }
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("status", status);
        if ("ON_LEAVE".equals(status)) {
            metadata.put("leaveStartDate", leaveStartDate);
            metadata.put("leaveEndDate", leaveEndDate);
            metadata.put("leaveReason", leaveReason == null ? "" : leaveReason);
        }
        auditWriter.record(tenantId, actorUserId, "WORKER_STATUS_UPDATED", "WORKER", workerId, metadata);
        return find(tenantId, workerId);
    }

    @Transactional
    public void delete(UUID tenantId, UUID actorUserId, UUID workerId) {
        requireWorker(tenantId, workerId);
        var linkedUserId = linkedUserId(tenantId, workerId);
        if (hasOperationalHistory(tenantId, workerId)) {
            throw new BadRequestException("Worker has work, clock, or payroll history. Deactivate or terminate the worker instead.");
        }
        jdbcTemplate.update("UPDATE assets SET assigned_worker_id = NULL WHERE tenant_id = ? AND assigned_worker_id = ?", tenantId, workerId);
        var deleted = jdbcTemplate.update("DELETE FROM workers WHERE tenant_id = ? AND id = ?", tenantId, workerId);
        if (deleted != 1) {
            throw new ResourceNotFoundException("Worker not found.");
        }
        if (linkedUserId != null) {
            revokeWorkerRefreshSessions(linkedUserId, tenantId);
        }
        auditWriter.record(tenantId, actorUserId, "WORKER_DELETED", "WORKER", workerId, Map.of());
    }

    private void createEmergencyContact(UUID tenantId, UUID workerId, CreateWorkerRequest.EmergencyContactRequest request) {
        if (request == null || request.contactName() == null || request.contactName().isBlank() || request.phone() == null || request.phone().isBlank()) {
            return;
        }
        jdbcTemplate.update("""
                INSERT INTO worker_emergency_contacts (tenant_id, worker_id, contact_name, relationship, phone)
                VALUES (?, ?, ?, ?, ?)
                """, tenantId, workerId, request.contactName(), blankToNull(request.relationship()), request.phone());
    }

    private void replaceEmergencyContact(UUID tenantId, UUID workerId, CreateWorkerRequest.EmergencyContactRequest request) {
        jdbcTemplate.update("DELETE FROM worker_emergency_contacts WHERE tenant_id = ? AND worker_id = ?", tenantId, workerId);
        createEmergencyContact(tenantId, workerId, request);
    }

    private void createCertifications(UUID tenantId, UUID workerId, List<CreateWorkerRequest.CertificationRequest> requests) {
        if (requests == null) {
            return;
        }
        for (var request : requests) {
            if (request.certificationName() == null || request.certificationName().isBlank()) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO worker_certifications (tenant_id, worker_id, certification_name, issued_by, issued_on, expires_on)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, tenantId, workerId, request.certificationName(), blankToNull(request.issuedBy()), request.issuedOn(), request.expiresOn());
        }
    }

    private void replaceCertifications(UUID tenantId, UUID workerId, List<CreateWorkerRequest.CertificationRequest> requests) {
        jdbcTemplate.update("DELETE FROM worker_certifications WHERE tenant_id = ? AND worker_id = ?", tenantId, workerId);
        createCertifications(tenantId, workerId, requests);
    }

    private UUID linkedUserId(UUID tenantId, UUID workerId) {
        var userIds = jdbcTemplate.query("""
                SELECT user_id
                FROM workers
                WHERE tenant_id = ?
                  AND id = ?
                  AND user_id IS NOT NULL
                """, (rs, rowNum) -> rs.getObject("user_id", UUID.class), tenantId, workerId);
        return userIds.isEmpty() ? null : userIds.getFirst();
    }

    private void revokeWorkerRefreshSessions(UUID userId, UUID tenantId) {
        jdbcTemplate.update("""
                UPDATE auth_refresh_sessions
                SET revoked_at = now()
                WHERE user_id = ?
                  AND tenant_id = ?
                  AND client_type = 'WORKER'
                  AND revoked_at IS NULL
                """, userId, tenantId);
    }

    private void createServiceSkills(UUID tenantId, UUID workerId, UUID actorUserId, List<UUID> serviceTypeIds) {
        if (serviceTypeIds == null || serviceTypeIds.isEmpty()) {
            return;
        }
        for (var serviceTypeId : serviceTypeIds.stream().distinct().toList()) {
            if (serviceTypeId == null) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO worker_service_skills (tenant_id, worker_id, service_type_id, created_by, updated_by)
                    SELECT ?, ?, st.id, ?, ?
                    FROM service_types st
                    WHERE st.tenant_id = ? AND st.id = ? AND st.active = true
                    ON CONFLICT (tenant_id, worker_id, service_type_id) DO NOTHING
                    """, tenantId, workerId, actorUserId, actorUserId, tenantId, serviceTypeId);
        }
    }

    private void replaceServiceSkills(UUID tenantId, UUID workerId, UUID actorUserId, List<UUID> serviceTypeIds) {
        jdbcTemplate.update("DELETE FROM worker_service_skills WHERE tenant_id = ? AND worker_id = ?", tenantId, workerId);
        createServiceSkills(tenantId, workerId, actorUserId, serviceTypeIds);
    }

    private void createShifts(UUID tenantId, UUID workerId, UUID actorUserId, List<CreateWorkerRequest.ShiftTemplateRequest> shifts) {
        if (shifts == null || shifts.isEmpty()) {
            return;
        }
        for (var shift : shifts) {
            if (shift == null || shift.dayOfWeek() < 1 || shift.dayOfWeek() > 7 || shift.startTime() == null || shift.endTime() == null || !shift.startTime().isBefore(shift.endTime())) {
                continue;
            }
            jdbcTemplate.update("""
                    INSERT INTO worker_shift_templates (
                        tenant_id, worker_id, day_of_week, start_time, end_time, timezone, created_by, updated_by
                    )
                    VALUES (?, ?, ?, ?, ?, COALESCE(?, 'America/Toronto'), ?, ?)
                    ON CONFLICT (tenant_id, worker_id, day_of_week, start_time, end_time) DO NOTHING
                    """,
                    tenantId,
                    workerId,
                    shift.dayOfWeek(),
                    shift.startTime(),
                    shift.endTime(),
                    blankToNull(shift.timezone()),
                    actorUserId,
                    actorUserId
            );
        }
    }

    private void replaceShifts(UUID tenantId, UUID workerId, UUID actorUserId, List<CreateWorkerRequest.ShiftTemplateRequest> shifts) {
        jdbcTemplate.update("DELETE FROM worker_shift_templates WHERE tenant_id = ? AND worker_id = ?", tenantId, workerId);
        createShifts(tenantId, workerId, actorUserId, shifts);
    }

    private Map<UUID, WorkerDto.EmergencyContactDto> emergencyContactsByWorker(UUID tenantId) {
        var contacts = new LinkedHashMap<UUID, WorkerDto.EmergencyContactDto>();
        jdbcTemplate.query("""
                SELECT DISTINCT ON (worker_id) worker_id, contact_name, relationship, phone
                FROM worker_emergency_contacts
                WHERE tenant_id = ?
                ORDER BY worker_id, created_at DESC
                """, (RowCallbackHandler) rs -> contacts.put(
                rs.getObject("worker_id", UUID.class),
                new WorkerDto.EmergencyContactDto(rs.getString("contact_name"), rs.getString("relationship"), rs.getString("phone"))
        ), tenantId);
        return contacts;
    }

    private Map<UUID, List<WorkerDto.CertificationDto>> certificationsByWorker(UUID tenantId) {
        var certifications = new LinkedHashMap<UUID, List<WorkerDto.CertificationDto>>();
        jdbcTemplate.query("""
                SELECT id, worker_id, certification_name, issued_by, issued_on, expires_on
                FROM worker_certifications
                WHERE tenant_id = ?
                ORDER BY expires_on NULLS LAST, certification_name
                """, (RowCallbackHandler) rs -> certifications.computeIfAbsent(rs.getObject("worker_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkerDto.CertificationDto(
                        rs.getObject("id", UUID.class),
                        rs.getString("certification_name"),
                        rs.getString("issued_by"),
                        rs.getObject("issued_on", java.time.LocalDate.class),
                        rs.getObject("expires_on", java.time.LocalDate.class)
                )
        ), tenantId);
        return certifications;
    }

    private Map<UUID, List<WorkerDto.ServiceSkillDto>> serviceSkillsByWorker(UUID tenantId) {
        var skills = new LinkedHashMap<UUID, List<WorkerDto.ServiceSkillDto>>();
        jdbcTemplate.query("""
                SELECT wss.worker_id, wss.service_type_id, st.name AS service_name, sc.name AS category_name, wss.skill_level
                FROM worker_service_skills wss
                JOIN service_types st ON st.id = wss.service_type_id AND st.tenant_id = wss.tenant_id
                LEFT JOIN service_categories sc ON sc.id = st.category_id AND sc.tenant_id = st.tenant_id
                WHERE wss.tenant_id = ?
                ORDER BY sc.name NULLS LAST, st.name
                """, (RowCallbackHandler) rs -> skills.computeIfAbsent(rs.getObject("worker_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkerDto.ServiceSkillDto(
                        rs.getObject("service_type_id", UUID.class),
                        rs.getString("service_name"),
                        rs.getString("category_name"),
                        rs.getString("skill_level")
                )
        ), tenantId);
        return skills;
    }

    private Map<UUID, List<WorkerDto.ShiftTemplateDto>> shiftsByWorker(UUID tenantId) {
        var shifts = new LinkedHashMap<UUID, List<WorkerDto.ShiftTemplateDto>>();
        jdbcTemplate.query("""
                SELECT id, worker_id, day_of_week, start_time, end_time, timezone, active
                FROM worker_shift_templates
                WHERE tenant_id = ?
                ORDER BY day_of_week, start_time
                """, (RowCallbackHandler) rs -> shifts.computeIfAbsent(rs.getObject("worker_id", UUID.class), ignored -> new ArrayList<>()).add(
                new WorkerDto.ShiftTemplateDto(
                        rs.getObject("id", UUID.class),
                        rs.getInt("day_of_week"),
                        rs.getTime("start_time").toLocalTime(),
                        rs.getTime("end_time").toLocalTime(),
                        rs.getString("timezone"),
                        rs.getBoolean("active")
                )
        ), tenantId);
        return shifts;
    }

    private String engagementType(String value) {
        return value == null || value.isBlank() ? "FULL_TIME" : value;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String activityType(String value) {
        var activityType = value == null || value.isBlank() ? "OTHER" : value.trim().toUpperCase();
        if (!List.of("OFFICE", "SUPPLIER", "SHOP", "WAREHOUSE", "TRAVEL", "BREAK", "OTHER").contains(activityType)) {
            throw new BadRequestException("Worker activity type is not supported.");
        }
        return activityType;
    }

    private Instant instant(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private ZoneId tenantZoneId(UUID tenantId) {
        var timezones = jdbcTemplate.query("""
                SELECT COALESCE(timezone, 'America/Toronto') AS timezone
                FROM tenants
                WHERE id = ?
                """, (rs, rowNum) -> rs.getString("timezone"), tenantId);
        return ZoneId.of(timezones.isEmpty() ? "America/Toronto" : timezones.getFirst());
    }

    private String normalizeStatus(String value) {
        var status = value == null ? "" : value.trim().toUpperCase();
        if (!List.of("ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED").contains(status)) {
            throw new BadRequestException("Worker status is not supported.");
        }
        return status;
    }

    private void requireWorker(UUID tenantId, UUID workerId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM workers
                WHERE tenant_id = ? AND id = ?
                """, Integer.class, tenantId, workerId);
        if (count == null || count == 0) {
            throw new ResourceNotFoundException("Worker not found.");
        }
    }

    private ActivitySnapshot activitySnapshot(UUID tenantId, UUID workerId, UUID activityId) {
        var activities = jdbcTemplate.query("""
                SELECT id, activity_date, activity_type, title, location_name, address, notes, started_at, ended_at
                FROM worker_daily_activities
                WHERE tenant_id = ? AND worker_id = ? AND id = ?
                """, (rs, rowNum) -> new ActivitySnapshot(
                rs.getObject("id", UUID.class),
                rs.getObject("activity_date", LocalDate.class),
                rs.getString("activity_type"),
                rs.getString("title"),
                rs.getString("location_name"),
                rs.getString("address"),
                rs.getString("notes"),
                instant("started_at", rs),
                instant("ended_at", rs)
        ), tenantId, workerId, activityId);
        return activities.isEmpty() ? null : activities.getFirst();
    }

    private Map<String, Object> activityOverrideMetadata(
            UUID activityId,
            String action,
            ActivitySnapshot before,
            WorkerActivityOverrideRequest request,
            String reason
    ) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("activityId", activityId == null ? "" : activityId.toString());
        metadata.put("action", action);
        metadata.put("reason", reason);
        metadata.put("activityType", request.activityType() == null ? "" : request.activityType());
        metadata.put("title", request.title() == null ? "" : request.title());
        metadata.put("locationName", request.locationName() == null ? "" : request.locationName());
        metadata.put("address", request.address() == null ? "" : request.address());
        metadata.put("notes", request.notes() == null ? "" : request.notes());
        metadata.put("startedAt", request.startedAt() == null ? "" : request.startedAt().toString());
        metadata.put("endedAt", request.endedAt() == null ? "" : request.endedAt().toString());
        if (before != null) {
            metadata.put("beforeActivityType", before.activityType());
            metadata.put("beforeTitle", before.title());
            metadata.put("beforeStartedAt", before.startedAt() == null ? "" : before.startedAt().toString());
            metadata.put("beforeEndedAt", before.endedAt() == null ? "" : before.endedAt().toString());
        }
        return metadata;
    }

    private WorkerDto find(UUID tenantId, UUID workerId) {
        return list(tenantId).stream()
                .filter(worker -> worker.id().equals(workerId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Worker not found."));
    }

    private boolean hasOperationalHistory(UUID tenantId, UUID workerId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT (
                    (SELECT count(*) FROM work_order_assignments WHERE tenant_id = ? AND worker_id = ?) +
                    (SELECT count(*) FROM work_order_time_entries WHERE tenant_id = ? AND worker_id = ?) +
                    (SELECT count(*) FROM worker_shift_clock_entries WHERE tenant_id = ? AND worker_id = ?) +
                    (SELECT count(*) FROM payroll_records WHERE tenant_id = ? AND worker_id = ?)
                )::int
                """, Integer.class, tenantId, workerId, tenantId, workerId, tenantId, workerId, tenantId, workerId);
        return count != null && count > 0;
    }

    private void syncLinkedUserContact(UUID tenantId, UUID actorUserId, UUID workerId, String displayName, String phone, String email) {
        jdbcTemplate.update("""
                UPDATE app_users u
                SET display_name = ?, phone = COALESCE(?, u.phone), email = COALESCE(?, u.email),
                    updated_at = now(), updated_by = ?
                FROM workers w
                WHERE w.tenant_id = ? AND w.id = ? AND w.user_id = u.id
                """, displayName, phone, email, actorUserId, tenantId, workerId);
    }

    private record ActivitySnapshot(
            UUID id,
            LocalDate activityDate,
            String activityType,
            String title,
            String locationName,
            String address,
            String notes,
            Instant startedAt,
            Instant endedAt
    ) {
    }
}
