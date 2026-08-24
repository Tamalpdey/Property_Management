package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.fieldwork.internal.dto.WorkerActivityRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerDailyLoadoutDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerLoadoutToolActionRequest;
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
public class WorkerDailyLoadoutService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final WorkerShiftClockService workerShiftClockService;

    public WorkerDailyLoadoutService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            WorkerShiftClockService workerShiftClockService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.workerShiftClockService = workerShiftClockService;
    }

    @Transactional
    public WorkerDailyLoadoutDto loadout(UUID tenantId, UUID userId, String email, LocalDate date) {
        var worker = worker(tenantId, userId, email);
        var loadoutDate = date == null ? LocalDate.now(tenantZoneId(tenantId)) : date;
        closeStaleOpenActivities(tenantId, worker, userId, LocalDate.now(tenantZoneId(tenantId)), Instant.now());
        var loadoutId = ensureLoadout(tenantId, worker.id(), loadoutDate, userId);
        return loadout(tenantId, worker, loadoutId, loadoutDate);
    }

    @Transactional
    public WorkerDailyLoadoutDto checkOutTool(UUID tenantId, UUID userId, String email, LocalDate date, WorkerLoadoutToolActionRequest request) {
        return updateToolStatus(tenantId, userId, email, date, request, "CHECKED_OUT");
    }

    @Transactional
    public WorkerDailyLoadoutDto returnTool(UUID tenantId, UUID userId, String email, LocalDate date, WorkerLoadoutToolActionRequest request) {
        return updateToolStatus(tenantId, userId, email, date, request, "RETURNED");
    }

    @Transactional
    public WorkerDailyLoadoutDto reportToolIssue(UUID tenantId, UUID userId, String email, LocalDate date, WorkerLoadoutToolActionRequest request) {
        return updateToolStatus(tenantId, userId, email, date, request, "DAMAGED");
    }

    @Transactional
    public WorkerDailyLoadoutDto startActivity(UUID tenantId, UUID userId, String email, LocalDate date, WorkerActivityRequest request) {
        workerShiftClockService.requireClockedIn(tenantId, userId, email);
        var worker = worker(tenantId, userId, email);
        var loadoutDate = date == null ? LocalDate.now(tenantZoneId(tenantId)) : date;
        var now = Instant.now();
        closeStaleOpenActivities(tenantId, worker, userId, LocalDate.now(tenantZoneId(tenantId)), now);
        if (hasOpenActivity(tenantId, worker.id())) {
            throw new BadRequestException("End the current worker activity before starting another.");
        }
        var activityType = activityType(request == null ? null : request.activityType());
        var title = blankToNull(request == null ? null : request.title());
        var activityId = jdbcTemplate.queryForObject("""
                INSERT INTO worker_daily_activities (
                    tenant_id, worker_id, activity_date, activity_type, title, location_name, address, notes,
                    started_at, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                worker.id(),
                loadoutDate,
                activityType,
                title == null ? defaultActivityTitle(activityType) : title,
                blankToNull(request == null ? null : request.locationName()),
                blankToNull(request == null ? null : request.address()),
                blankToNull(request == null ? null : request.notes()),
                timestamp(now),
                userId,
                userId
        );
        auditWriter.record(tenantId, userId, "WORKER_ACTIVITY_STARTED", "WORKER", worker.id(), activityMetadata(worker, activityId, loadoutDate, activityType, request, now));
        var loadoutId = ensureLoadout(tenantId, worker.id(), loadoutDate, userId);
        return loadout(tenantId, worker, loadoutId, loadoutDate);
    }

    @Transactional
    public WorkerDailyLoadoutDto endActivity(UUID tenantId, UUID userId, String email, LocalDate date, UUID activityId, WorkerActivityRequest request) {
        workerShiftClockService.requireClockedIn(tenantId, userId, email);
        var worker = worker(tenantId, userId, email);
        var loadoutDate = date == null ? LocalDate.now(tenantZoneId(tenantId)) : date;
        var now = Instant.now();
        var updated = jdbcTemplate.update("""
                UPDATE worker_daily_activities
                SET ended_at = ?, notes = COALESCE(NULLIF(?, ''), notes), updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND worker_id = ? AND id = ? AND ended_at IS NULL
                """,
                timestamp(now),
                request == null ? null : blankToNull(request.notes()),
                userId,
                tenantId,
                worker.id(),
                activityId
        );
        if (updated != 1) {
            throw new ResourceNotFoundException("Open worker activity was not found.");
        }
        auditWriter.record(tenantId, userId, "WORKER_ACTIVITY_ENDED", "WORKER", worker.id(), activityMetadata(worker, activityId, loadoutDate, "", request, now));
        var loadoutId = ensureLoadout(tenantId, worker.id(), loadoutDate, userId);
        return loadout(tenantId, worker, loadoutId, loadoutDate);
    }

    private WorkerDailyLoadoutDto updateToolStatus(
            UUID tenantId,
            UUID userId,
            String email,
            LocalDate date,
            WorkerLoadoutToolActionRequest request,
            String status
    ) {
        if (request == null || request.workOrderId() == null || request.assetId() == null) {
            throw new BadRequestException("Work order and tool are required.");
        }
        workerShiftClockService.requireClockedIn(tenantId, userId, email);
        var worker = worker(tenantId, userId, email);
        var loadoutDate = date == null ? LocalDate.now(tenantZoneId(tenantId)) : date;
        requireAssignedTool(tenantId, worker.id(), request.workOrderId(), request.assetId());
        var loadoutId = ensureLoadout(tenantId, worker.id(), loadoutDate, userId);
        var now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO worker_daily_loadout_items (
                    tenant_id, loadout_id, work_order_id, asset_id, status, checked_out_at, returned_at, issue_note, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (tenant_id, loadout_id, work_order_id, asset_id)
                DO UPDATE SET status = EXCLUDED.status,
                              checked_out_at = coalesce(worker_daily_loadout_items.checked_out_at, EXCLUDED.checked_out_at),
                              returned_at = EXCLUDED.returned_at,
                              issue_note = EXCLUDED.issue_note,
                              updated_by = EXCLUDED.updated_by,
                              updated_at = now()
                """,
                tenantId,
                loadoutId,
                request.workOrderId(),
                request.assetId(),
                status,
                timestamp(now),
                "RETURNED".equals(status) ? timestamp(now) : null,
                Set.of("DAMAGED", "MISSING").contains(status) ? blankToNull(request.note()) : null,
                userId,
                userId
        );
        if ("RETURNED".equals(status)) {
            jdbcTemplate.update("""
                    UPDATE work_order_assets
                    SET released_at = coalesce(released_at, ?), updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND work_order_id = ? AND asset_id = ?
                    """, timestamp(now), userId, tenantId, request.workOrderId(), request.assetId());
        }
        updateLoadoutStatus(tenantId, loadoutId, userId);
        auditWriter.record(tenantId, userId, auditAction(status), "WORK_ORDER", request.workOrderId(), actionMetadata(
                worker,
                loadoutId,
                loadoutDate,
                request.assetId(),
                request.note(),
                now
        ));
        return loadout(tenantId, worker, loadoutId, loadoutDate);
    }

    private WorkerDailyLoadoutDto loadout(UUID tenantId, WorkerRef worker, UUID loadoutId, LocalDate loadoutDate) {
        var zoneId = tenantZoneId(tenantId);
        var start = Timestamp.from(loadoutDate.atStartOfDay(zoneId).toInstant());
        var end = Timestamp.from(loadoutDate.plusDays(1).atStartOfDay(zoneId).toInstant());
        var tools = toolItems(tenantId, worker.id(), loadoutId, start, end);
        var materials = materialItems(tenantId, worker.id(), start, end);
        var activities = activityItems(tenantId, worker.id(), loadoutDate);
        var scheduledJobs = scheduledJobCount(tenantId, worker.id(), start, end);
        var checkedOut = countTools(tools, "CHECKED_OUT");
        var returned = countTools(tools, "RETURNED");
        var issues = tools.stream().filter(tool -> Set.of("DAMAGED", "MISSING").contains(tool.status())).toList().size();
        var status = loadoutStatus(tools);
        return new WorkerDailyLoadoutDto(
                loadoutId,
                loadoutDate,
                worker.id(),
                worker.displayName(),
                status,
                scheduledJobs,
                tools.size(),
                checkedOut,
                returned,
                issues,
                tools,
                materials,
                activities
        );
    }

    private List<WorkerDailyLoadoutDto.ToolItemDto> toolItems(UUID tenantId, UUID workerId, UUID loadoutId, Timestamp start, Timestamp end) {
        return jdbcTemplate.query("""
                SELECT a.id AS asset_id, wo.id AS work_order_id, wo.work_order_number, wo.title AS work_order_title,
                       p.name AS property_name, a.asset_type, a.name, a.identifier,
                       coalesce(wdli.status, CASE WHEN woa.released_at IS NOT NULL THEN 'RETURNED' ELSE 'PLANNED' END) AS loadout_status,
                       coalesce(wdli.issue_note, '') AS issue_note
                FROM work_order_assignments assignment
                JOIN work_orders wo ON wo.id = assignment.work_order_id AND wo.tenant_id = assignment.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                JOIN work_order_assets woa ON woa.work_order_id = wo.id AND woa.tenant_id = wo.tenant_id
                JOIN assets a ON a.id = woa.asset_id AND a.tenant_id = woa.tenant_id
                LEFT JOIN worker_daily_loadout_items wdli
                       ON wdli.tenant_id = woa.tenant_id
                      AND wdli.loadout_id = ?
                      AND wdli.work_order_id = woa.work_order_id
                      AND wdli.asset_id = woa.asset_id
                WHERE assignment.tenant_id = ?
                  AND assignment.worker_id = ?
                  AND assignment.assignment_status NOT IN ('DECLINED', 'RELEASED', 'LEFT_EMERGENCY')
                  AND wo.status <> 'CANCELLED'
                  AND wo.scheduled_start >= ? AND wo.scheduled_start < ?
                ORDER BY wo.scheduled_start, p.name, a.asset_type, a.name
                """, (rs, rowNum) -> new WorkerDailyLoadoutDto.ToolItemDto(
                rs.getObject("asset_id", UUID.class),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("work_order_title"),
                rs.getString("property_name"),
                rs.getString("asset_type"),
                rs.getString("name"),
                rs.getString("identifier"),
                rs.getString("loadout_status"),
                rs.getString("issue_note")
        ), loadoutId, tenantId, workerId, start, end);
    }

    private List<WorkerDailyLoadoutDto.MaterialItemDto> materialItems(UUID tenantId, UUID workerId, Timestamp start, Timestamp end) {
        return jdbcTemplate.query("""
                SELECT wom.id AS material_id, wom.inventory_item_id, wo.id AS work_order_id, wo.work_order_number,
                       wo.title AS work_order_title, p.name AS property_name, ii.name AS item_name,
                       wom.description, wom.quantity, coalesce(ii.unit, '') AS unit, wom.used
                FROM work_order_assignments assignment
                JOIN work_orders wo ON wo.id = assignment.work_order_id AND wo.tenant_id = assignment.tenant_id
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                JOIN work_order_materials wom ON wom.work_order_id = wo.id AND wom.tenant_id = wo.tenant_id
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE assignment.tenant_id = ?
                  AND assignment.worker_id = ?
                  AND assignment.assignment_status NOT IN ('DECLINED', 'RELEASED', 'LEFT_EMERGENCY')
                  AND wo.status <> 'CANCELLED'
                  AND wo.scheduled_start >= ? AND wo.scheduled_start < ?
                ORDER BY wo.scheduled_start, p.name, wom.description
                """, (rs, rowNum) -> new WorkerDailyLoadoutDto.MaterialItemDto(
                rs.getObject("material_id", UUID.class),
                rs.getObject("inventory_item_id", UUID.class),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("work_order_title"),
                rs.getString("property_name"),
                rs.getString("item_name"),
                rs.getString("description"),
                rs.getBigDecimal("quantity"),
                rs.getString("unit"),
                rs.getBoolean("used")
        ), tenantId, workerId, start, end);
    }

    private int scheduledJobCount(UUID tenantId, UUID workerId, Timestamp start, Timestamp end) {
        return jdbcTemplate.queryForObject("""
                SELECT count(*)
                FROM work_order_assignments assignment
                JOIN work_orders wo ON wo.id = assignment.work_order_id AND wo.tenant_id = assignment.tenant_id
                WHERE assignment.tenant_id = ?
                  AND assignment.worker_id = ?
                  AND assignment.assignment_status NOT IN ('DECLINED', 'RELEASED', 'LEFT_EMERGENCY')
                  AND wo.status <> 'CANCELLED'
                  AND wo.scheduled_start >= ? AND wo.scheduled_start < ?
                """, Integer.class, tenantId, workerId, start, end);
    }

    private List<WorkerDailyLoadoutDto.ActivityItemDto> activityItems(UUID tenantId, UUID workerId, LocalDate loadoutDate) {
        return jdbcTemplate.query("""
                SELECT id, activity_type, title, location_name, address, notes, started_at, ended_at,
                       CASE WHEN ended_at IS NULL THEN NULL
                            ELSE floor(extract(epoch from (ended_at - started_at)) / 60)::bigint
                       END AS duration_minutes
                FROM worker_daily_activities
                WHERE tenant_id = ?
                  AND worker_id = ?
                  AND activity_date = ?
                ORDER BY started_at DESC
                """, (rs, rowNum) -> new WorkerDailyLoadoutDto.ActivityItemDto(
                rs.getObject("id", UUID.class),
                rs.getString("activity_type"),
                rs.getString("title"),
                rs.getString("location_name"),
                rs.getString("address"),
                rs.getString("notes"),
                instant("started_at", rs),
                instant("ended_at", rs),
                (Long) rs.getObject("duration_minutes"),
                rs.getTimestamp("ended_at") == null
        ), tenantId, workerId, loadoutDate);
    }

    private void closeStaleOpenActivities(UUID tenantId, WorkerRef worker, UUID userId, LocalDate currentDate, Instant actionAt) {
        var zoneId = tenantZoneId(tenantId);
        var staleActivities = jdbcTemplate.query("""
                SELECT id, activity_date, activity_type, title, started_at
                FROM worker_daily_activities
                WHERE tenant_id = ?
                  AND worker_id = ?
                  AND ended_at IS NULL
                  AND activity_date < ?
                ORDER BY started_at
                """, (rs, rowNum) -> new OpenActivity(
                rs.getObject("id", UUID.class),
                rs.getObject("activity_date", LocalDate.class),
                rs.getString("activity_type"),
                rs.getString("title"),
                instant("started_at", rs)
        ), tenantId, worker.id(), currentDate);
        for (var activity : staleActivities) {
            var dayBoundary = activity.activityDate().plusDays(1).atStartOfDay(zoneId).toInstant();
            var preferredEnd = staleActivityEndAt(tenantId, worker.id(), activity, dayBoundary);
            var endedAt = preferredEnd.isAfter(actionAt) ? actionAt : preferredEnd;
            if (!endedAt.isAfter(activity.startedAt())) {
                endedAt = actionAt.isAfter(activity.startedAt()) ? actionAt : activity.startedAt().plusSeconds(60);
            }
            var updated = jdbcTemplate.update("""
                    UPDATE worker_daily_activities
                    SET ended_at = ?, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND worker_id = ? AND id = ? AND ended_at IS NULL
                    """, timestamp(endedAt), userId, tenantId, worker.id(), activity.id());
            if (updated != 1) {
                continue;
            }
            auditWriter.record(tenantId, userId, "WORKER_ACTIVITY_AUTO_ENDED", "WORKER", worker.id(), autoEndedActivityMetadata(
                    worker,
                    activity,
                    endedAt,
                    "Activity was left open from a previous day.",
                    actionAt
            ));
        }
    }

    private Instant staleActivityEndAt(UUID tenantId, UUID workerId, OpenActivity activity, Instant dayBoundary) {
        var clockOut = jdbcTemplate.query("""
                SELECT ended_at
                FROM worker_shift_clock_entries
                WHERE tenant_id = ?
                  AND worker_id = ?
                  AND ended_at IS NOT NULL
                  AND ended_at > ?
                  AND ended_at <= ?
                ORDER BY ended_at DESC
                LIMIT 1
                """, rs -> rs.next() ? instant("ended_at", rs) : null, tenantId, workerId, timestamp(activity.startedAt()), timestamp(dayBoundary));
        return clockOut == null ? dayBoundary : clockOut;
    }

    private boolean hasOpenActivity(UUID tenantId, UUID workerId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM worker_daily_activities
                    WHERE tenant_id = ?
                      AND worker_id = ?
                      AND ended_at IS NULL
                )
                """, Boolean.class, tenantId, workerId));
    }

    private UUID ensureLoadout(UUID tenantId, UUID workerId, LocalDate loadoutDate, UUID userId) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO worker_daily_loadouts (tenant_id, worker_id, loadout_date, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT (tenant_id, worker_id, loadout_date)
                DO UPDATE SET updated_at = worker_daily_loadouts.updated_at
                RETURNING id
                """, UUID.class, tenantId, workerId, loadoutDate, userId, userId);
    }

    private void requireAssignedTool(UUID tenantId, UUID workerId, UUID workOrderId, UUID assetId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_assignments assignment
                    JOIN work_orders wo ON wo.id = assignment.work_order_id AND wo.tenant_id = assignment.tenant_id
                    JOIN work_order_assets woa ON woa.work_order_id = wo.id AND woa.tenant_id = wo.tenant_id
                    WHERE assignment.tenant_id = ?
                      AND assignment.worker_id = ?
                      AND assignment.work_order_id = ?
                      AND woa.asset_id = ?
                      AND assignment.assignment_status NOT IN ('DECLINED', 'RELEASED', 'LEFT_EMERGENCY')
                      AND wo.status <> 'CANCELLED'
                )
                """, Boolean.class, tenantId, workerId, workOrderId, assetId));
        if (!exists) {
            throw new ResourceNotFoundException("Tool or equipment is not assigned to one of your jobs.");
        }
    }

    private void updateLoadoutStatus(UUID tenantId, UUID loadoutId, UUID userId) {
        var counts = jdbcTemplate.query("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE status = 'CHECKED_OUT') AS checked_out,
                       count(*) FILTER (WHERE status = 'RETURNED') AS returned,
                       count(*) FILTER (WHERE status IN ('DAMAGED', 'MISSING')) AS issues
                FROM worker_daily_loadout_items
                WHERE tenant_id = ? AND loadout_id = ?
                """, rs -> {
            rs.next();
            return new LoadoutCounts(rs.getInt("total"), rs.getInt("checked_out"), rs.getInt("returned"), rs.getInt("issues"));
        }, tenantId, loadoutId);
        var status = counts.issues() > 0
                ? "ISSUE_REPORTED"
                : counts.total() > 0 && counts.returned() == counts.total()
                ? "RETURNED"
                : counts.checkedOut() > 0
                ? "CHECKED_OUT"
                : "PLANNED";
        jdbcTemplate.update("""
                UPDATE worker_daily_loadouts
                SET status = ?, checked_out_at = CASE WHEN checked_out_at IS NULL AND ? THEN now() ELSE checked_out_at END,
                    returned_at = CASE WHEN ? THEN now() ELSE returned_at END,
                    updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, status, counts.checkedOut() > 0, "RETURNED".equals(status), userId, tenantId, loadoutId);
    }

    private String loadoutStatus(List<WorkerDailyLoadoutDto.ToolItemDto> tools) {
        if (tools.isEmpty()) {
            return "PLANNED";
        }
        if (tools.stream().anyMatch(tool -> Set.of("DAMAGED", "MISSING").contains(tool.status()))) {
            return "ISSUE_REPORTED";
        }
        if (tools.stream().allMatch(tool -> "RETURNED".equals(tool.status()))) {
            return "RETURNED";
        }
        if (tools.stream().anyMatch(tool -> "CHECKED_OUT".equals(tool.status()))) {
            return "CHECKED_OUT";
        }
        return "PLANNED";
    }

    private int countTools(List<WorkerDailyLoadoutDto.ToolItemDto> tools, String status) {
        return (int) tools.stream().filter(tool -> status.equals(tool.status())).count();
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

    private ZoneId tenantZoneId(UUID tenantId) {
        var timezone = jdbcTemplate.queryForObject("SELECT timezone FROM tenants WHERE id = ?", String.class, tenantId);
        return ZoneId.of(timezone == null || timezone.isBlank() ? "America/Toronto" : timezone);
    }

    private Map<String, Object> actionMetadata(
            WorkerRef worker,
            UUID loadoutId,
            LocalDate loadoutDate,
            UUID assetId,
            String note,
            Instant actionAt
    ) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workerId", worker.id().toString());
        metadata.put("workerName", worker.displayName());
        metadata.put("workerEmail", worker.email());
        metadata.put("loadoutId", loadoutId.toString());
        metadata.put("loadoutDate", loadoutDate.toString());
        metadata.put("assetId", assetId.toString());
        metadata.put("note", note == null ? "" : note);
        metadata.put("actionAt", actionAt.toString());
        return metadata;
    }

    private Map<String, Object> autoEndedActivityMetadata(
            WorkerRef worker,
            OpenActivity activity,
            Instant endedAt,
            String reason,
            Instant actionAt
    ) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workerId", worker.id().toString());
        metadata.put("workerName", worker.displayName());
        metadata.put("workerEmail", worker.email());
        metadata.put("activityId", activity.id().toString());
        metadata.put("activityDate", activity.activityDate().toString());
        metadata.put("activityType", activity.activityType() == null ? "" : activity.activityType());
        metadata.put("title", activity.title() == null ? "" : activity.title());
        metadata.put("startedAt", activity.startedAt().toString());
        metadata.put("endedAt", endedAt.toString());
        metadata.put("reason", reason);
        metadata.put("actionAt", actionAt.toString());
        return metadata;
    }

    private String auditAction(String status) {
        return switch (status) {
            case "CHECKED_OUT" -> "WORKER_LOADOUT_TOOL_CHECKED_OUT";
            case "RETURNED" -> "WORKER_LOADOUT_TOOL_RETURNED";
            case "DAMAGED" -> "WORKER_LOADOUT_TOOL_ISSUE_REPORTED";
            default -> "WORKER_LOADOUT_UPDATED";
        };
    }

    private Map<String, Object> activityMetadata(
            WorkerRef worker,
            UUID activityId,
            LocalDate activityDate,
            String activityType,
            WorkerActivityRequest request,
            Instant actionAt
    ) {
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("workerId", worker.id().toString());
        metadata.put("workerName", worker.displayName());
        metadata.put("workerEmail", worker.email());
        metadata.put("activityId", activityId.toString());
        metadata.put("activityDate", activityDate.toString());
        metadata.put("activityType", activityType == null ? "" : activityType);
        metadata.put("title", request == null || request.title() == null ? "" : request.title());
        metadata.put("locationName", request == null || request.locationName() == null ? "" : request.locationName());
        metadata.put("address", request == null || request.address() == null ? "" : request.address());
        metadata.put("notes", request == null || request.notes() == null ? "" : request.notes());
        metadata.put("actionAt", actionAt.toString());
        return metadata;
    }

    private String activityType(String value) {
        var type = value == null ? "OFFICE" : value.trim().toUpperCase();
        if (!Set.of("OFFICE", "SUPPLIER", "SHOP", "WAREHOUSE", "TRAVEL", "BREAK", "OTHER").contains(type)) {
            throw new BadRequestException("Worker activity type is not supported.");
        }
        return type;
    }

    private String defaultActivityTitle(String activityType) {
        return switch (activityType) {
            case "SUPPLIER" -> "Supplier stop";
            case "SHOP" -> "Shop work";
            case "WAREHOUSE" -> "Warehouse stop";
            case "TRAVEL" -> "Travel";
            case "BREAK" -> "Break";
            case "OTHER" -> "Other activity";
            default -> "Office visit";
        };
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

    private record LoadoutCounts(int total, int checkedOut, int returned, int issues) {
    }

    private record OpenActivity(UUID id, LocalDate activityDate, String activityType, String title, Instant startedAt) {
    }
}
