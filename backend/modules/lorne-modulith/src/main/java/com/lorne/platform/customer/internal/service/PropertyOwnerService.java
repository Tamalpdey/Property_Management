package com.lorne.platform.customer.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.customer.internal.dto.CreatePropertyOwnerRequest;
import com.lorne.platform.customer.internal.dto.PropertyOwnerDto;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PropertyOwnerService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public PropertyOwnerService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<PropertyOwnerDto> list(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT c.id, c.display_name, c.email, c.phone, c.billing_email, c.notes, c.active,
                       count(p.id)::int AS property_count
                FROM customers c
                LEFT JOIN properties p ON p.customer_id = c.id AND p.tenant_id = c.tenant_id
                WHERE c.tenant_id = ?
                GROUP BY c.id, c.display_name, c.email, c.phone, c.billing_email, c.notes, c.active
                ORDER BY c.active DESC, c.display_name
                """, (rs, rowNum) -> new PropertyOwnerDto(
                rs.getObject("id", UUID.class),
                rs.getString("display_name"),
                rs.getString("email"),
                rs.getString("phone"),
                rs.getString("billing_email"),
                rs.getString("notes"),
                rs.getInt("property_count"),
                rs.getBoolean("active")
        ), tenantId);
    }

    @Transactional
    public PropertyOwnerDto create(UUID tenantId, UUID actorUserId, CreatePropertyOwnerRequest request) {
        var ownerId = jdbcTemplate.queryForObject("""
                INSERT INTO customers (tenant_id, display_name, email, phone, billing_email, notes)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class, tenantId, request.displayName(), request.email(), request.phone(), request.billingEmail(), request.notes());

        auditWriter.record(tenantId, actorUserId, "PROPERTY_OWNER_CREATED", "PROPERTY_OWNER", ownerId, Map.of(
                "displayName", request.displayName(),
                "hasBillingEmail", request.billingEmail() != null && !request.billingEmail().isBlank()
        ));
        return find(tenantId, ownerId);
    }

    @Transactional
    public PropertyOwnerDto update(UUID tenantId, UUID actorUserId, UUID ownerId, CreatePropertyOwnerRequest request) {
        var updated = jdbcTemplate.update("""
                UPDATE customers
                SET display_name = ?, email = ?, phone = ?, billing_email = ?, notes = ?,
                    updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """,
                request.displayName(),
                blankToNull(request.email()),
                blankToNull(request.phone()),
                blankToNull(request.billingEmail()),
                blankToNull(request.notes()),
                actorUserId,
                tenantId,
                ownerId
        );
        if (updated != 1) {
            throw new ResourceNotFoundException("Property owner not found.");
        }
        auditWriter.record(tenantId, actorUserId, "PROPERTY_OWNER_UPDATED", "PROPERTY_OWNER", ownerId, Map.of(
                "displayName", request.displayName(),
                "hasBillingEmail", request.billingEmail() != null && !request.billingEmail().isBlank()
        ));
        return find(tenantId, ownerId);
    }

    @Transactional
    public PropertyOwnerDto updateStatus(UUID tenantId, UUID actorUserId, UUID ownerId, boolean active) {
        var updated = jdbcTemplate.update("""
                UPDATE customers
                SET active = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, active, actorUserId, tenantId, ownerId);
        if (updated != 1) {
            throw new ResourceNotFoundException("Property owner not found.");
        }
        auditWriter.record(tenantId, actorUserId, active ? "PROPERTY_OWNER_ACTIVATED" : "PROPERTY_OWNER_DEACTIVATED", "PROPERTY_OWNER", ownerId, Map.of(
                "active", active
        ));
        return find(tenantId, ownerId);
    }

    @Transactional
    public void delete(UUID tenantId, UUID actorUserId, UUID ownerId) {
        var propertyCount = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM properties
                WHERE tenant_id = ? AND customer_id = ?
                """, Integer.class, tenantId, ownerId);
        if (propertyCount != null && propertyCount > 0) {
            throw new BadRequestException("Owner has properties. Deactivate the owner or move/delete properties first.");
        }
        var deleted = jdbcTemplate.update("""
                DELETE FROM customers
                WHERE tenant_id = ? AND id = ?
                """, tenantId, ownerId);
        if (deleted != 1) {
            throw new ResourceNotFoundException("Property owner not found.");
        }
        auditWriter.record(tenantId, actorUserId, "PROPERTY_OWNER_DELETED", "PROPERTY_OWNER", ownerId, Map.of(
                "propertyCount", propertyCount == null ? 0 : propertyCount
        ));
    }

    private PropertyOwnerDto find(UUID tenantId, UUID ownerId) {
        return list(tenantId).stream()
                .filter(owner -> owner.id().equals(ownerId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Property owner not found."));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
