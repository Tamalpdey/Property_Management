package com.lorne.platform.worker.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.worker.internal.dto.CreateWorkerRequest;
import com.lorne.platform.worker.internal.dto.WorkerDto;
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
                       w.max_weekly_hours, w.hourly_rate, w.hire_date
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
                emergencyContacts.get(rs.getObject("id", UUID.class)),
                certifications.getOrDefault(rs.getObject("id", UUID.class), List.of()),
                serviceSkills.getOrDefault(rs.getObject("id", UUID.class), List.of()),
                shifts.getOrDefault(rs.getObject("id", UUID.class), List.of())
        ), tenantId);
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

    private void createEmergencyContact(UUID tenantId, UUID workerId, CreateWorkerRequest.EmergencyContactRequest request) {
        if (request == null || request.contactName() == null || request.contactName().isBlank() || request.phone() == null || request.phone().isBlank()) {
            return;
        }
        jdbcTemplate.update("""
                INSERT INTO worker_emergency_contacts (tenant_id, worker_id, contact_name, relationship, phone)
                VALUES (?, ?, ?, ?, ?)
                """, tenantId, workerId, request.contactName(), blankToNull(request.relationship()), request.phone());
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
}
