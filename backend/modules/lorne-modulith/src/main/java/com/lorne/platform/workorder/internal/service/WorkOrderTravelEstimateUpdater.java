package com.lorne.platform.workorder.internal.service;

import com.lorne.platform.integration.TravelEstimate;
import com.lorne.platform.integration.TravelEstimateService;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
class WorkOrderTravelEstimateUpdater {
    private final JdbcTemplate jdbcTemplate;
    private final TravelEstimateService travelEstimateService;

    WorkOrderTravelEstimateUpdater(JdbcTemplate jdbcTemplate, TravelEstimateService travelEstimateService) {
        this.jdbcTemplate = jdbcTemplate;
        this.travelEstimateService = travelEstimateService;
    }

    void refresh(UUID tenantId, UUID workOrderId) {
        if (!travelEstimateService.enabled()) {
            return;
        }
        clearEstimates(tenantId, workOrderId);
        var context = workOrderTravelContext(tenantId, workOrderId).orElse(null);
        if (context == null || blank(context.propertyAddress())) {
            return;
        }

        var originAddress = tenantAddress(tenantId).orElse(null);
        var routeStops = routeStops(tenantId, workOrderId);
        for (var routeStop : routeStops) {
            if (!blank(originAddress) && !blank(routeStop.address())) {
                travelEstimateService.estimateDrivingTime(originAddress, routeStop.address(), departureAt(routeStop.plannedArrival(), context.scheduledStart()))
                        .ifPresent(estimate -> updateRouteStopEstimate(tenantId, workOrderId, routeStop.id(), estimate));
            }
            if (!blank(routeStop.address())) {
                originAddress = routeStop.address();
            }
        }

        if (!blank(originAddress)) {
            travelEstimateService.estimateDrivingTime(originAddress, context.propertyAddress(), context.scheduledStart())
                    .ifPresent(estimate -> updateAssignmentEstimates(tenantId, workOrderId, estimate));
        }
    }

    private void clearEstimates(UUID tenantId, UUID workOrderId) {
        jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET estimated_travel_minutes = NULL,
                    estimated_travel_distance_meters = NULL,
                    travel_estimate_provider = NULL,
                    travel_estimated_at = NULL
                WHERE tenant_id = ? AND work_order_id = ?
                """, tenantId, workOrderId);
        jdbcTemplate.update("""
                UPDATE work_order_route_stops
                SET estimated_travel_minutes = NULL,
                    estimated_travel_distance_meters = NULL,
                    travel_estimate_provider = NULL,
                    travel_estimated_at = NULL
                WHERE tenant_id = ? AND work_order_id = ?
                """, tenantId, workOrderId);
    }

    private Optional<String> tenantAddress(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT concat_ws(', ',
                           NULLIF(ts.address_line1, ''),
                           NULLIF(ts.city, ''),
                           NULLIF(ts.province_code, ''),
                           NULLIF(ts.postal_code, ''),
                           NULLIF(ts.country_code, '')
                       ) AS address
                FROM tenant_settings ts
                WHERE ts.tenant_id = ?
                """, rs -> rs.next() ? Optional.ofNullable(blankToNull(rs.getString("address"))) : Optional.empty(), tenantId);
    }

    private Optional<WorkOrderTravelContext> workOrderTravelContext(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT concat_ws(', ',
                           NULLIF(p.address_line1, ''),
                           NULLIF(p.address_line2, ''),
                           NULLIF(p.city, ''),
                           NULLIF(p.province_code, ''),
                           NULLIF(p.postal_code, '')
                       ) AS address,
                       wo.scheduled_start
                FROM work_orders wo
                JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                WHERE wo.tenant_id = ? AND wo.id = ?
                """, rs -> {
            if (!rs.next()) {
                return Optional.empty();
            }
            return Optional.of(new WorkOrderTravelContext(
                    blankToNull(rs.getString("address")),
                    instant("scheduled_start", rs)
            ));
        }, tenantId, workOrderId);
    }

    private List<RouteStopAddress> routeStops(UUID tenantId, UUID workOrderId) {
        return jdbcTemplate.query("""
                SELECT id, address, planned_arrival
                FROM work_order_route_stops
                WHERE tenant_id = ? AND work_order_id = ? AND visible_to_worker = true
                ORDER BY stop_order, created_at
                """, (rs, rowNum) -> new RouteStopAddress(
                rs.getObject("id", UUID.class),
                blankToNull(rs.getString("address")),
                instant("planned_arrival", rs)
        ), tenantId, workOrderId);
    }

    private void updateRouteStopEstimate(UUID tenantId, UUID workOrderId, UUID routeStopId, TravelEstimate estimate) {
        jdbcTemplate.update("""
                UPDATE work_order_route_stops
                SET estimated_travel_minutes = ?,
                    estimated_travel_distance_meters = ?,
                    travel_estimate_provider = ?,
                    travel_estimated_at = ?
                WHERE tenant_id = ? AND work_order_id = ? AND id = ?
                """,
                estimate.minutes(),
                estimate.distanceMeters(),
                estimate.provider(),
                timestamp(estimate.estimatedAt()),
                tenantId,
                workOrderId,
                routeStopId
        );
    }

    private void updateAssignmentEstimates(UUID tenantId, UUID workOrderId, TravelEstimate estimate) {
        jdbcTemplate.update("""
                UPDATE work_order_assignments
                SET estimated_travel_minutes = ?,
                    estimated_travel_distance_meters = ?,
                    travel_estimate_provider = ?,
                    travel_estimated_at = ?
                WHERE tenant_id = ? AND work_order_id = ?
                """,
                estimate.minutes(),
                estimate.distanceMeters(),
                estimate.provider(),
                timestamp(estimate.estimatedAt()),
                tenantId,
                workOrderId
        );
    }

    private Timestamp timestamp(Instant instant) {
        return instant == null ? null : Timestamp.from(instant);
    }

    private Instant instant(String column, java.sql.ResultSet rs) throws java.sql.SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }

    private Instant departureAt(Instant plannedArrival, Instant scheduledStart) {
        return plannedArrival == null ? scheduledStart : plannedArrival;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record WorkOrderTravelContext(String propertyAddress, Instant scheduledStart) {
    }

    private record RouteStopAddress(UUID id, String address, Instant plannedArrival) {
    }
}
