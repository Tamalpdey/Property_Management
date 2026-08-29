package com.lorne.platform.property.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.property.internal.dto.CreatePropertyRequest;
import com.lorne.platform.property.internal.dto.PropertyDto;
import com.lorne.platform.property.internal.dto.PropertyServiceAssignmentDto;
import com.lorne.platform.property.internal.dto.UpdatePropertyServicesRequest;
import com.lorne.platform.shared.PublicCodeGenerator;
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
                SELECT p.id, p.property_code, p.customer_id, c.owner_code, c.display_name AS owner_name, p.name, p.address_line1, p.address_line2,
                       p.city, p.province_code, p.postal_code, p.country_code, p.service_notes, p.active
                FROM properties p
                JOIN customers c ON c.id = p.customer_id AND c.tenant_id = p.tenant_id
                WHERE p.tenant_id = ?
                ORDER BY p.updated_at DESC, p.name
                """, (rs, rowNum) -> new PropertyDto(
                rs.getObject("id", UUID.class),
                rs.getString("property_code"),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_code"),
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
        requireTenantOwner(tenantId, request.ownerId());
        var propertyId = UUID.randomUUID();
        var propertyCode = PublicCodeGenerator.propertyCode(propertyId);
        jdbcTemplate.update("""
                INSERT INTO properties (
                    id, tenant_id, property_code, customer_id, name, address_line1, address_line2, city,
                    province_code, postal_code, country_code, service_notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'CA'), ?)
                """,
                propertyId,
                tenantId,
                propertyCode,
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

        var owner = jdbcTemplate.queryForObject(
                "SELECT owner_code, display_name FROM customers WHERE tenant_id = ? AND id = ?",
                (rs, rowNum) -> new OwnerRef(rs.getString("owner_code"), rs.getString("display_name")),
                tenantId,
                request.ownerId()
        );

        auditWriter.record(tenantId, actorUserId, "PROPERTY_CREATED", "PROPERTY", propertyId, Map.of(
                "name", request.name(),
                "ownerId", request.ownerId().toString(),
                "ownerCode", owner.ownerCode(),
                "ownerName", owner.ownerName(),
                "city", request.city()
        ));
        return new PropertyDto(
                propertyId,
                propertyCode,
                request.ownerId(),
                owner.ownerCode(),
                owner.ownerName(),
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
    public PropertyDto update(UUID tenantId, UUID actorUserId, UUID propertyId, CreatePropertyRequest request) {
        requireProperty(tenantId, propertyId);
        requireTenantOwner(tenantId, request.ownerId());
        var updated = jdbcTemplate.update("""
                UPDATE properties
                SET customer_id = ?, name = ?, address_line1 = ?, address_line2 = ?, city = ?,
                    province_code = ?, postal_code = ?, country_code = COALESCE(?, 'CA'),
                    service_notes = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """,
                request.ownerId(),
                request.name(),
                request.addressLine1(),
                request.addressLine2(),
                request.city(),
                request.provinceCode(),
                request.postalCode(),
                request.countryCode(),
                request.serviceNotes(),
                actorUserId,
                tenantId,
                propertyId
        );
        if (updated != 1) {
            throw new ResourceNotFoundException("Property not found.");
        }
        var property = property(tenantId, propertyId);
        auditWriter.record(tenantId, actorUserId, "PROPERTY_UPDATED", "PROPERTY", propertyId, Map.of(
                "name", property.name(),
                "ownerId", property.ownerId().toString(),
                "ownerName", property.ownerName(),
                "city", property.city()
        ));
        return property;
    }

    @Transactional
    public PropertyDto updateStatus(UUID tenantId, UUID actorUserId, UUID propertyId, boolean active) {
        requireProperty(tenantId, propertyId);
        var updated = jdbcTemplate.update("""
                UPDATE properties
                SET active = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, active, actorUserId, tenantId, propertyId);
        if (updated != 1) {
            throw new ResourceNotFoundException("Property not found.");
        }
        auditWriter.record(tenantId, actorUserId, active ? "PROPERTY_ACTIVATED" : "PROPERTY_DEACTIVATED", "PROPERTY", propertyId, Map.of(
                "active", active
        ));
        return property(tenantId, propertyId);
    }

    @Transactional
    public void delete(UUID tenantId, UUID actorUserId, UUID propertyId) {
        requireProperty(tenantId, propertyId);
        if (hasOperationalHistory(tenantId, propertyId)) {
            throw new BadRequestException("Property has work history and must be deactivated instead.");
        }
        jdbcTemplate.update("DELETE FROM property_service_types WHERE tenant_id = ? AND property_id = ?", tenantId, propertyId);
        jdbcTemplate.update("DELETE FROM property_access_instructions WHERE tenant_id = ? AND property_id = ?", tenantId, propertyId);
        jdbcTemplate.update("DELETE FROM properties WHERE tenant_id = ? AND id = ?", tenantId, propertyId);
        auditWriter.record(tenantId, actorUserId, "PROPERTY_DELETED", "PROPERTY", propertyId, Map.of());
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
                SELECT p.id, p.property_code, p.customer_id, c.owner_code, c.display_name AS owner_name, p.name, p.address_line1, p.address_line2,
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
                    rs.getString("property_code"),
                    rs.getObject("customer_id", UUID.class),
                    rs.getString("owner_code"),
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

    private void requireTenantOwner(UUID tenantId, UUID ownerId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM customers WHERE tenant_id = ? AND id = ? AND active = true)",
                Boolean.class,
                tenantId,
                ownerId
        ));
        if (!exists) {
            throw new BadRequestException("Property owner is not available for this tenant.");
        }
    }

    private boolean hasOperationalHistory(UUID tenantId, UUID propertyId) {
        var workOrderCount = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM work_orders
                WHERE tenant_id = ? AND property_id = ?
                """, Integer.class, tenantId, propertyId);
        var recurringTemplateCount = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM recurring_work_templates
                WHERE tenant_id = ? AND property_id = ?
                """, Integer.class, tenantId, propertyId);
        return (workOrderCount != null && workOrderCount > 0)
                || (recurringTemplateCount != null && recurringTemplateCount > 0);
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

    private record OwnerRef(String ownerCode, String ownerName) {
    }
}
