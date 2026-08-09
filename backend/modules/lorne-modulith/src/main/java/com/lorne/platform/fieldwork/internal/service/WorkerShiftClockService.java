package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkerShiftClockService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final WorkerShiftClockAutoClockOutProperties autoClockOutProperties;

    public WorkerShiftClockService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            WorkerShiftClockAutoClockOutProperties autoClockOutProperties
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.autoClockOutProperties = autoClockOutProperties;
    }

    @Transactional(readOnly = true)
    public WorkerShiftClockDto state(UUID tenantId, UUID userId, String email) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open != null) {
            return open;
        }
        var last = jdbcTemplate.query("""
                SELECT id, started_at, ended_at
                FROM worker_shift_clock_entries
                WHERE tenant_id = ? AND worker_id = ?
                ORDER BY started_at DESC
                LIMIT 1
                """, rs -> rs.next()
                        ? new WorkerShiftClockDto(false, rs.getObject("id", UUID.class), instant("started_at", rs), instant("ended_at", rs))
                        : new WorkerShiftClockDto(false, null, null, null), tenantId, worker.id());
        return last;
    }

    @Transactional
    public WorkerShiftClockDto clockIn(UUID tenantId, UUID userId, String email, WorkerShiftClockRequest request) {
        var worker = worker(tenantId, userId, email);
        var existing = openEntry(tenantId, worker.id());
        if (existing != null) {
            return existing;
        }
        var now = Instant.now();
        var entryId = jdbcTemplate.queryForObject("""
                INSERT INTO worker_shift_clock_entries (
                    tenant_id, worker_id, started_at, start_latitude, start_longitude, start_accuracy_meters,
                    device_started_at, start_platform, start_user_agent, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                worker.id(),
                timestamp(now),
                request == null ? null : request.latitude(),
                request == null ? null : request.longitude(),
                request == null ? null : request.locationAccuracyMeters(),
                timestamp(deviceTimestamp(request)),
                request == null ? null : blankToNull(request.platform()),
                request == null ? null : truncate(blankToNull(request.userAgent()), 512),
                userId,
                userId
        );
        auditWriter.record(tenantId, userId, "WORKER_CLOCK_IN", "WORKER", worker.id(), metadata(worker, request, now));
        return new WorkerShiftClockDto(true, entryId, now, null);
    }

    @Transactional
    public WorkerShiftClockDto clockOut(UUID tenantId, UUID userId, String email, WorkerShiftClockRequest request) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open == null) {
            return state(tenantId, userId, email);
        }
        var now = Instant.now();
        jdbcTemplate.update("""
                UPDATE worker_shift_clock_entries
                SET ended_at = ?, end_latitude = ?, end_longitude = ?, end_accuracy_meters = ?,
                    device_ended_at = ?, end_platform = ?, end_user_agent = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND worker_id = ? AND id = ? AND ended_at IS NULL
                """,
                timestamp(now),
                request == null ? null : request.latitude(),
                request == null ? null : request.longitude(),
                request == null ? null : request.locationAccuracyMeters(),
                timestamp(deviceTimestamp(request)),
                request == null ? null : blankToNull(request.platform()),
                request == null ? null : truncate(blankToNull(request.userAgent()), 512),
                userId,
                tenantId,
                worker.id(),
                open.entryId()
        );
        auditWriter.record(tenantId, userId, "WORKER_CLOCK_OUT", "WORKER", worker.id(), metadata(worker, request, now));
        return new WorkerShiftClockDto(false, open.entryId(), open.startedAt(), now);
    }

    @Transactional(readOnly = true)
    public void requireClockedIn(UUID tenantId, UUID userId, String email) {
        var worker = worker(tenantId, userId, email);
        if (openEntry(tenantId, worker.id()) == null) {
            throw new BadRequestException("Clock in before working on assigned jobs.");
        }
    }

    @Transactional
    public int autoClockOutForgottenShifts() {
        if (!autoClockOutProperties.enabled()) {
            return 0;
        }
        var now = Instant.now();
        var entries = openClockEntries();
        var closed = 0;
        for (var entry : entries) {
            var autoClockOutAt = autoClockOutAt(entry);
            if (autoClockOutAt == null || autoClockOutAt.isAfter(now)) {
                continue;
            }
            var endedAt = autoClockOutAt.isBefore(entry.startedAt()) ? now : autoClockOutAt;
            var updated = jdbcTemplate.update("""
                    UPDATE worker_shift_clock_entries
                    SET ended_at = ?, device_ended_at = ?, end_platform = ?, end_user_agent = ?, updated_at = now()
                    WHERE tenant_id = ? AND worker_id = ? AND id = ? AND ended_at IS NULL
                    """,
                    timestamp(endedAt),
                    timestamp(now),
                    "system",
                    "auto-clock-out",
                    entry.tenantId(),
                    entry.workerId(),
                    entry.entryId()
            );
            if (updated == 0) {
                continue;
            }
            auditWriter.record(entry.tenantId(), null, "WORKER_CLOCK_OUT_AUTO", "WORKER", entry.workerId(), Map.of(
                    "workerName", entry.workerName(),
                    "workerEmail", entry.workerEmail() == null ? "" : entry.workerEmail(),
                    "entryId", entry.entryId().toString(),
                    "startedAt", entry.startedAt().toString(),
                    "endedAt", endedAt.toString(),
                    "reason", entry.shiftEndAt() == null ? "max open duration exceeded" : "shift ended and grace period elapsed",
                    "graceMinutes", autoClockOutProperties.graceMinutes(),
                    "maxOpenHours", autoClockOutProperties.maxOpenHours(),
                    "actionAt", now.toString()
            ));
            closed += 1;
        }
        return closed;
    }

    private WorkerShiftClockDto openEntry(UUID tenantId, UUID workerId) {
        return jdbcTemplate.query("""
                SELECT id, started_at
                FROM worker_shift_clock_entries
                WHERE tenant_id = ? AND worker_id = ? AND ended_at IS NULL
                LIMIT 1
                """, rs -> rs.next()
                        ? new WorkerShiftClockDto(true, rs.getObject("id", UUID.class), instant("started_at", rs), null)
                        : null, tenantId, workerId);
    }

    private List<OpenClockEntry> openClockEntries() {
        return jdbcTemplate.query("""
                SELECT wsce.id, wsce.tenant_id, wsce.worker_id, wsce.started_at,
                       w.display_name AS worker_name, w.email AS worker_email,
                       coalesce(wst.timezone, t.timezone, 'America/Toronto') AS shift_timezone,
                       wst.end_time
                FROM worker_shift_clock_entries wsce
                JOIN workers w ON w.id = wsce.worker_id AND w.tenant_id = wsce.tenant_id
                JOIN tenants t ON t.id = wsce.tenant_id
                LEFT JOIN LATERAL (
                    SELECT timezone, end_time
                    FROM worker_shift_templates candidate
                    WHERE candidate.tenant_id = wsce.tenant_id
                      AND candidate.worker_id = wsce.worker_id
                      AND candidate.active = true
                      AND candidate.day_of_week = extract(isodow FROM wsce.started_at AT TIME ZONE candidate.timezone)::int
                      AND (wsce.started_at AT TIME ZONE candidate.timezone)::time <= candidate.end_time
                    ORDER BY candidate.start_time DESC
                    LIMIT 1
                ) wst ON true
                WHERE wsce.ended_at IS NULL
                ORDER BY wsce.started_at
                """, (rs, rowNum) -> {
            var startedAt = instant("started_at", rs);
            var zoneId = zoneId(rs.getString("shift_timezone"));
            var endTime = localTime("end_time", rs);
            Instant shiftEndAt = null;
            if (endTime != null) {
                var localStart = LocalDateTime.ofInstant(startedAt, zoneId);
                shiftEndAt = LocalDateTime.of(localStart.toLocalDate(), endTime).atZone(zoneId).toInstant();
            }
            return new OpenClockEntry(
                    rs.getObject("id", UUID.class),
                    rs.getObject("tenant_id", UUID.class),
                    rs.getObject("worker_id", UUID.class),
                    rs.getString("worker_name"),
                    rs.getString("worker_email"),
                    startedAt,
                    shiftEndAt
            );
        });
    }

    private Instant autoClockOutAt(OpenClockEntry entry) {
        if (entry.shiftEndAt() != null) {
            return entry.shiftEndAt().plusSeconds(autoClockOutProperties.graceMinutes() * 60L);
        }
        return entry.startedAt().plusSeconds(autoClockOutProperties.maxOpenHours() * 60L * 60L);
    }

    private WorkerRef worker(UUID tenantId, UUID userId, String email) {
        return jdbcTemplate.query("""
                SELECT id, display_name, email
                FROM workers
                WHERE tenant_id = ? AND status = 'ACTIVE'
                  AND (user_id = ? OR lower(email::text) = lower(?))
                ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END
                LIMIT 1
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Worker profile is not linked to this login.");
            }
            return new WorkerRef(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email"));
        }, tenantId, userId, email, userId);
    }

    private Map<String, Object> metadata(WorkerRef worker, WorkerShiftClockRequest request, Instant actionAt) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workerName", worker.displayName());
        metadata.put("workerEmail", worker.email());
        metadata.put("actionAt", actionAt.toString());
        if (request != null) {
            putIfPresent(metadata, "latitude", request.latitude());
            putIfPresent(metadata, "longitude", request.longitude());
            putIfPresent(metadata, "locationAccuracyMeters", request.locationAccuracyMeters());
            putIfPresent(metadata, "deviceTimestamp", blankToNull(request.deviceTimestamp()));
            putIfPresent(metadata, "platform", blankToNull(request.platform()));
            putIfPresent(metadata, "userAgent", truncate(blankToNull(request.userAgent()), 512));
        }
        return metadata;
    }

    private void putIfPresent(Map<String, Object> metadata, String key, Object value) {
        if (value != null) {
            metadata.put(key, value);
        }
    }

    private Instant deviceTimestamp(WorkerShiftClockRequest request) {
        if (request == null || blankToNull(request.deviceTimestamp()) == null) {
            return null;
        }
        try {
            return Instant.parse(request.deviceTimestamp());
        } catch (DateTimeParseException ignored) {
            return null;
        }
    }

    private Instant instant(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private LocalTime localTime(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var time = rs.getTime(column);
        return time == null ? null : time.toLocalTime();
    }

    private ZoneId zoneId(String value) {
        try {
            return ZoneId.of(value == null || value.isBlank() ? "America/Toronto" : value);
        } catch (RuntimeException ignored) {
            return ZoneId.of("America/Toronto");
        }
    }

    private Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private record WorkerRef(UUID id, String displayName, String email) {
    }

    private record OpenClockEntry(
            UUID entryId,
            UUID tenantId,
            UUID workerId,
            String workerName,
            String workerEmail,
            Instant startedAt,
            Instant shiftEndAt
    ) {
    }
}
