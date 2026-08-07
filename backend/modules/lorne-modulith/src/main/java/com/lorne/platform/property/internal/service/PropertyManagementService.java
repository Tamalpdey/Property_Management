package com.lorne.platform.property.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.property.internal.dto.CreatePropertyRequest;
import com.lorne.platform.property.internal.dto.PropertyDto;
import com.lorne.platform.property.internal.dto.PropertyServiceAssignmentDto;
import com.lorne.platform.property.internal.dto.UpdatePropertyServicesRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PropertyManagementService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public PropertyManagementService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<PropertyDto> list(UUID tenantId) {
        var servicesByProperty = servicesByProperty(tenantId);
        return jdbcTemplate.query("""
                SELECT p.id, p.customer_id, c.display_name AS owner_name, p.name, p.address_line1, p.address_line2,
                       p.city, p.province_code, p.postal_code, p.country_code, p.service_notes, p.active
                FROM properties p
                JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
                WHERE p.tenant_id = ?
                ORDER BY p.updated_at DESC, p.name
                """, (rs, rowNum) -> new PropertyDto(
                rs.getObject("id", UUID.class),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_name"),
                rs.getString("name"),
                rs.getString("address_line1"),
                rs.getString("address_line2"),
                rs.getString("city"),
                rs.getString("province_code"),
                rs.getString("postal_code"),
                rs.getString("country_code"),
                rs.getString("service_notes"),
                rs.getBoolean("active"),
                servicesByProperty.getOrDefault(rs.getObject("id", UUID.class), List.of())
        ), tenantId);
    }

    @Transactional
    public PropertyDto create(UUID tenantId, UUID actorUserId, CreatePropertyRequest request) {
        var propertyId = jdbcTemplate.queryForObject("""
                INSERT INTO properties (
                    tenant_id, customer_id, name, address_line1, address_line2, city,
                    province_code, postal_code, country_code, service_notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'CA'), ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                request.ownerId(),
                request.name(),
                request.addressLine1(),
                request.addressLine2(),
                request.city(),
                request.provinceCode(),
                request.postalCode(),
                request.countryCode(),
                request.serviceNotes()
        );

        var ownerName = jdbcTemplate.queryForObject(
                "SELECT display_name FROM customers WHERE tenant_id = ? AND id = ?",
                String.class,
                tenantId,
                request.ownerId()
        );

        auditWriter.record(tenantId, actorUserId, "PROPERTY_CREATED", "PROPERTY", propertyId, Map.of(
                "name", request.name(),
                "ownerId", request.ownerId().toString(),
                "ownerName", ownerName,
                "city", request.city()
        ));
        return new PropertyDto(
                propertyId,
                request.ownerId(),
                ownerName,
                request.name(),
                request.addressLine1(),
                request.addressLine2(),
                request.city(),
                request.provinceCode(),
                request.postalCode(),
                request.countryCode() == null ? "CA" : request.countryCode(),
                request.serviceNotes(),
                true,
                List.of()
        );
    }

    @Transactional
    public PropertyDto updateServices(UUID tenantId, UUID actorUserId, UUID propertyId, UpdatePropertyServicesRequest request) {
        requireProperty(tenantId, propertyId);

        var serviceTypeIds = request.serviceTypeIds().stream()
                .distinct()
                .toList();
        requireTenantServiceTypes(tenantId, serviceTypeIds);

        jdbcTemplate.update(
                "DELETE FROM property_service_types WHERE tenant_id = ? AND property_id = ?",
                tenantId,
                propertyId
        );

        for (var serviceTypeId : serviceTypeIds) {
            jdbcTemplate.update("""
                    INSERT INTO property_service_types (tenant_id, property_id, service_type_id)
                    VALUES (?, ?, ?)
                    """, tenantId, propertyId, serviceTypeId);
        }

        auditWriter.record(tenantId, actorUserId, "PROPERTY_SERVICES_UPDATED", "PROPERTY", propertyId, Map.of(
                "serviceTypeCount", serviceTypeIds.size(),
                "serviceTypeIds", serviceTypeIds.stream().map(UUID::toString).toList()
        ));
        return property(tenantId, propertyId);
    }

    private PropertyDto property(UUID tenantId, UUID propertyId) {
        var servicesByProperty = servicesByProperty(tenantId);
        return jdbcTemplate.query("""
                SELECT p.id, p.customer_id, c.display_name AS owner_name, p.name, p.address_line1, p.address_line2,
                       p.city, p.province_code, p.postal_code, p.country_code, p.service_notes, p.active
                FROM properties p
                JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
                WHERE p.tenant_id = ? AND p.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new ResourceNotFoundException("Property not found.");
            }
            return new PropertyDto(
                    rs.getObject("id", UUID.class),
                    rs.getObject("customer_id", UUID.class),
                    rs.getString("owner_name"),
                    rs.getString("name"),
                    rs.getString("address_line1"),
                    rs.getString("address_line2"),
                    rs.getString("city"),
                    rs.getString("province_code"),
                    rs.getString("postal_code"),
                    rs.getString("country_code"),
                    rs.getString("service_notes"),
                    rs.getBoolean("active"),
                    servicesByProperty.getOrDefault(rs.getObject("id", UUID.class), List.of())
            );
        }, tenantId, propertyId);
    }

    private void requireProperty(UUID tenantId, UUID propertyId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM properties WHERE tenant_id = ? AND id = ?)",
                Boolean.class,
                tenantId,
                propertyId
        ));
        if (!exists) {
            throw new ResourceNotFoundException("Property not found.");
        }
    }

    private void requireTenantServiceTypes(UUID tenantId, List<UUID> serviceTypeIds) {
        if (serviceTypeIds.isEmpty()) {
            return;
        }
        var placeholders = String.join(",", serviceTypeIds.stream().map(id -> "?").toList());
        var params = new ArrayList<Object>();
        params.add(tenantId);
        params.addAll(serviceTypeIds);
        var count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM service_types WHERE tenant_id = ? AND active = true AND id IN (" + placeholders + ")",
                Integer.class,
                params.toArray()
        );
        if (count == null || count != serviceTypeIds.size()) {
            throw new BadRequestException("One or more services are not available for this tenant.");
        }
    }

    private Map<UUID, List<PropertyServiceAssignmentDto>> servicesByProperty(UUID tenantId) {
        var grouped = new LinkedHashMap<UUID, List<PropertyServiceAssignmentDto>>();
        jdbcTemplate.query("""
                SELECT ps.property_id, ps.id, ps.service_type_id, st.category_id, sc.name AS category_name,
                       st.name AS service_name, st.default_duration_minutes, st.base_price, ps.notes, ps.active
                FROM property_service_types ps
                JOIN service_types st ON st.id = ps.service_type_id AND st.tenant_id = ps.tenant_id
                LEFT JOIN service_categories sc ON sc.id = st.category_id AND sc.tenant_id = st.tenant_id
                WHERE ps.tenant_id = ?
                ORDER BY sc.name NULLS LAST, st.name
                """, rs -> {
            var propertyId = rs.getObject("property_id", UUID.class);
            grouped.computeIfAbsent(propertyId, ignored -> new ArrayList<>()).add(new PropertyServiceAssignmentDto(
                    rs.getObject("id", UUID.class),
                    rs.getObject("service_type_id", UUID.class),
                    rs.getString("service_name"),
                    rs.getObject("category_id", UUID.class),
                    rs.getString("category_name"),
                    rs.getInt("default_duration_minutes"),
                    rs.getBigDecimal("base_price"),
                    rs.getString("notes"),
                    rs.getBoolean("active")
            ));
        }, tenantId);
        return grouped;
    }
}
