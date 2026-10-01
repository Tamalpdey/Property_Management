package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.worker.internal.dto.WorkerClockEntryDto;
import java.sql.Timestamp;
import java.time.Duration;
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
                SELECT wsce.id, wsce.started_at, wsce.ended_at,
                       COALESCE(pt.pause_minutes, 0)::bigint AS pause_minutes
                FROM worker_shift_clock_entries wsce
                LEFT JOIN LATERAL (
                    SELECT floor(sum(extract(epoch from (ended_at - started_at))) / 60)::bigint AS pause_minutes
                    FROM worker_shift_clock_pauses wscp
                    WHERE wscp.tenant_id = wsce.tenant_id
                      AND wscp.worker_id = wsce.worker_id
                      AND wscp.shift_clock_entry_id = wsce.id
                      AND wscp.ended_at IS NOT NULL
                ) pt ON true
                WHERE wsce.tenant_id = ? AND wsce.worker_id = ?
                ORDER BY started_at DESC
                LIMIT 1
                """, rs -> rs.next()
                        ? clockDto(
                                false,
                                rs.getObject("id", UUID.class),
                                instant("started_at", rs),
                                instant("ended_at", rs),
                                false,
                                null,
                                null,
                                longValue(rs.getObject("pause_minutes"))
                        )
                        : clockDto(false, null, null, null, false, null, null, 0L), tenantId, worker.id());
        return last;
    }

    @Transactional(readOnly = true)
    public List<WorkerClockEntryDto> entries(UUID tenantId, UUID userId, String email, LocalDate from, LocalDate to) {
        var worker = worker(tenantId, userId, email);
        var fromDate = from == null ? LocalDate.now(tenantZoneId(tenantId)) : from;
        var toDate = to == null ? fromDate : to;
        if (toDate.isBefore(fromDate)) {
            throw new BadRequestException("Clock entry end date must be on or after start date.");
        }
        return jdbcTemplate.query("""
                SELECT wsce.id, wsce.worker_id, wsce.started_at, wsce.ended_at,
                       CASE WHEN wsce.ended_at IS NULL THEN NULL
                            ELSE floor(extract(epoch from (wsce.ended_at - wsce.started_at)) / 60)::bigint
                       END AS duration_minutes,
                       COALESCE(pauses.pause_minutes, 0)::bigint AS pause_minutes,
                       override_audit.reason AS override_reason,
                       override_audit.created_at AS override_updated_at
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
                LEFT JOIN LATERAL (
                    SELECT audit_logs.metadata ->> 'reason' AS reason, audit_logs.created_at
                    FROM audit_logs
                    WHERE audit_logs.tenant_id = wsce.tenant_id
                      AND audit_logs.resource_type = 'WORKER'
                      AND audit_logs.resource_id = wsce.worker_id
                      AND audit_logs.action = 'WORKER_CLOCK_ENTRY_OVERRIDDEN'
                      AND audit_logs.metadata ->> 'clockEntryId' = wsce.id::text
                    ORDER BY audit_logs.created_at DESC
                    LIMIT 1
                ) override_audit ON true
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
                (Long) rs.getObject("pause_minutes"),
                rs.getTimestamp("override_updated_at") != null,
                rs.getString("override_reason"),
                instant("override_updated_at", rs)
        ), tenantId, worker.id(), toDate, fromDate);
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
        return clockDto(true, entryId, now, null, false, null, null, 0L);
    }

    @Transactional
    public WorkerShiftClockDto clockOut(UUID tenantId, UUID userId, String email, WorkerShiftClockRequest request) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open == null) {
            return state(tenantId, userId, email);
        }
        var now = Instant.now();
        if (open.paused() && open.pauseId() != null) {
            closePause(tenantId, worker.id(), open.pauseId(), userId, request, now);
        }
        closeOpenWorkerActivities(tenantId, worker.id(), worker.displayName(), worker.email(), userId, now, "shift clock-out", now);
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
        var pauseMinutes = pauseMinutes(tenantId, worker.id(), open.entryId());
        return clockDto(false, open.entryId(), open.startedAt(), now, false, null, null, pauseMinutes);
    }

    @Transactional
    public WorkerShiftClockDto pause(UUID tenantId, UUID userId, String email, WorkerShiftClockRequest request) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open == null) {
            throw new BadRequestException("Clock in before pausing your shift.");
        }
        if (open.paused()) {
            return open;
        }
        var now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO worker_shift_clock_pauses (
                    tenant_id, worker_id, shift_clock_entry_id, started_at, start_latitude, start_longitude,
                    start_accuracy_meters, device_started_at, start_platform, start_user_agent, note, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                tenantId,
                worker.id(),
                open.entryId(),
                timestamp(now),
                request == null ? null : request.latitude(),
                request == null ? null : request.longitude(),
                request == null ? null : request.locationAccuracyMeters(),
                timestamp(deviceTimestamp(request)),
                request == null ? null : blankToNull(request.platform()),
                request == null ? null : truncate(blankToNull(request.userAgent()), 512),
                request == null ? null : truncate(blankToNull(request.note()), 1000),
                userId,
                userId
        );
        auditWriter.record(tenantId, userId, "WORKER_SHIFT_PAUSE", "WORKER", worker.id(), metadata(worker, request, now));
        return openEntry(tenantId, worker.id());
    }

    @Transactional
    public WorkerShiftClockDto resume(UUID tenantId, UUID userId, String email, WorkerShiftClockRequest request) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open == null) {
            throw new BadRequestException("Clock in before resuming your shift.");
        }
        if (!open.paused() || open.pauseId() == null) {
            return open;
        }
        var now = Instant.now();
        closePause(tenantId, worker.id(), open.pauseId(), userId, request, now);
        auditWriter.record(tenantId, userId, "WORKER_SHIFT_RESUME", "WORKER", worker.id(), metadata(worker, request, now));
        return openEntry(tenantId, worker.id());
    }

    @Transactional(readOnly = true)
    public void requireClockedIn(UUID tenantId, UUID userId, String email) {
        var worker = worker(tenantId, userId, email);
        var open = openEntry(tenantId, worker.id());
        if (open == null) {
            throw new BadRequestException("Clock in before working on assigned jobs.");
        }
        if (open.paused()) {
            throw new BadRequestException("Resume your shift before working on assigned jobs.");
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
            jdbcTemplate.update("""
                    UPDATE worker_shift_clock_pauses
                    SET ended_at = ?, device_ended_at = ?, end_platform = ?, end_user_agent = ?, updated_at = now()
                    WHERE tenant_id = ? AND worker_id = ? AND shift_clock_entry_id = ? AND ended_at IS NULL
                    """,
                    timestamp(endedAt),
                    timestamp(now),
                    "system",
                    "auto-clock-out",
                    entry.tenantId(),
                    entry.workerId(),
                    entry.entryId()
            );
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
            closeOpenWorkerActivities(
                    entry.tenantId(),
                    entry.workerId(),
                    entry.workerName(),
                    entry.workerEmail(),
                    null,
                    endedAt,
                    "shift auto clock-out",
                    now
            );
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
                SELECT wsce.id, wsce.started_at,
                       open_pause.id AS pause_id,
                       open_pause.started_at AS paused_at,
                       COALESCE(pt.pause_minutes, 0)::bigint AS pause_minutes
                FROM worker_shift_clock_entries wsce
                LEFT JOIN LATERAL (
                    SELECT id, started_at
                    FROM worker_shift_clock_pauses wscp
                    WHERE wscp.tenant_id = wsce.tenant_id
                      AND wscp.worker_id = wsce.worker_id
                      AND wscp.shift_clock_entry_id = wsce.id
                      AND wscp.ended_at IS NULL
                    ORDER BY wscp.started_at DESC
                    LIMIT 1
                ) open_pause ON true
                LEFT JOIN LATERAL (
                    SELECT floor(sum(extract(epoch from (ended_at - started_at))) / 60)::bigint AS pause_minutes
                    FROM worker_shift_clock_pauses wscp
                    WHERE wscp.tenant_id = wsce.tenant_id
                      AND wscp.worker_id = wsce.worker_id
                      AND wscp.shift_clock_entry_id = wsce.id
                      AND wscp.ended_at IS NOT NULL
                ) pt ON true
                WHERE wsce.tenant_id = ? AND wsce.worker_id = ? AND wsce.ended_at IS NULL
                LIMIT 1
                """, rs -> rs.next()
                        ? clockDto(
                                true,
                                rs.getObject("id", UUID.class),
                                instant("started_at", rs),
                                null,
                                rs.getObject("pause_id") != null,
                                rs.getObject("pause_id", UUID.class),
                                instant("paused_at", rs),
                                longValue(rs.getObject("pause_minutes"))
                        )
                        : null, tenantId, workerId);
    }

    private void closePause(UUID tenantId, UUID workerId, UUID pauseId, UUID userId, WorkerShiftClockRequest request, Instant now) {
        jdbcTemplate.update("""
                UPDATE worker_shift_clock_pauses
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
                workerId,
                pauseId
        );
    }

    private Long pauseMinutes(UUID tenantId, UUID workerId, UUID entryId) {
        var value = jdbcTemplate.queryForObject("""
                SELECT COALESCE(floor(sum(extract(epoch from (ended_at - started_at))) / 60), 0)::bigint
                FROM worker_shift_clock_pauses
                WHERE tenant_id = ? AND worker_id = ? AND shift_clock_entry_id = ? AND ended_at IS NOT NULL
                """, Long.class, tenantId, workerId, entryId);
        return value == null ? 0L : value;
    }

    private WorkerShiftClockDto clockDto(
            boolean clockedIn,
            UUID entryId,
            Instant startedAt,
            Instant endedAt,
            boolean paused,
            UUID pauseId,
            Instant pausedAt,
            Long pauseMinutes
    ) {
        var basePauseMinutes = pauseMinutes == null ? 0L : pauseMinutes;
        var currentPauseMinutes = paused && pausedAt != null ? minutesBetween(pausedAt, Instant.now()) : 0L;
        var totalPauseMinutes = basePauseMinutes + currentPauseMinutes;
        var end = endedAt == null && startedAt != null ? Instant.now() : endedAt;
        var activeMinutes = Math.max(0L, minutesBetween(startedAt, end) - totalPauseMinutes);
        return new WorkerShiftClockDto(clockedIn, entryId, startedAt, endedAt, paused, pauseId, pausedAt, basePauseMinutes, activeMinutes);
    }

    private long minutesBetween(Instant start, Instant end) {
        if (start == null || end == null || !end.isAfter(start)) {
            return 0L;
        }
        return Math.max(0L, Duration.between(start, end).toMinutes());
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
            putIfPresent(metadata, "note", truncate(blankToNull(request.note()), 1000));
        }
        return metadata;
    }

    private Long longValue(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private void closeOpenWorkerActivities(
            UUID tenantId,
            UUID workerId,
            String workerName,
            String workerEmail,
            UUID userId,
            Instant endedAt,
            String reason,
            Instant actionAt
    ) {
        var activities = jdbcTemplate.query("""
                SELECT id, activity_date, activity_type, title, started_at
                FROM worker_daily_activities
                WHERE tenant_id = ? AND worker_id = ? AND ended_at IS NULL
                ORDER BY started_at
                """, (rs, rowNum) -> new OpenActivity(
                rs.getObject("id", UUID.class),
                rs.getObject("activity_date", LocalDate.class),
                rs.getString("activity_type"),
                rs.getString("title"),
                instant("started_at", rs)
        ), tenantId, workerId);
        for (var activity : activities) {
            var activityEndedAt = endedAt.isAfter(activity.startedAt()) ? endedAt : activity.startedAt().plusSeconds(60);
            var updated = jdbcTemplate.update("""
                    UPDATE worker_daily_activities
                    SET ended_at = ?, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND worker_id = ? AND id = ? AND ended_at IS NULL
                    """, timestamp(activityEndedAt), userId, tenantId, workerId, activity.id());
            if (updated != 1) {
                continue;
            }
            var metadata = new LinkedHashMap<String, Object>();
            metadata.put("workerName", workerName == null ? "" : workerName);
            metadata.put("workerEmail", workerEmail == null ? "" : workerEmail);
            metadata.put("activityId", activity.id().toString());
            metadata.put("activityDate", activity.activityDate().toString());
            metadata.put("activityType", activity.activityType() == null ? "" : activity.activityType());
            metadata.put("title", activity.title() == null ? "" : activity.title());
            metadata.put("startedAt", activity.startedAt().toString());
            metadata.put("endedAt", activityEndedAt.toString());
            metadata.put("reason", reason);
            metadata.put("actionAt", actionAt.toString());
            auditWriter.record(tenantId, userId, "WORKER_ACTIVITY_AUTO_ENDED", "WORKER", workerId, metadata);
        }
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

    private ZoneId tenantZoneId(UUID tenantId) {
        var timezone = jdbcTemplate.queryForObject("SELECT timezone FROM tenants WHERE id = ?", String.class, tenantId);
        return zoneId(timezone);
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

    private record OpenActivity(UUID id, LocalDate activityDate, String activityType, String title, Instant startedAt) {
    }
}
