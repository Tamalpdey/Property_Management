package com.lorne.platform.customer.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.customer.internal.dto.CreatePropertyOwnerRequest;
import com.lorne.platform.customer.internal.dto.PropertyOwnerDto;
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
                SELECT c.id, c.display_name, c.email, c.phone, c.billing_email, c.notes,
                       count(p.id)::int AS property_count
                FROM customers c
                LEFT JOIN properties p ON p.customer_id = c.id AND p.tenant_id = c.tenant_id
                WHERE c.tenant_id = ?
                GROUP BY c.id, c.display_name, c.email, c.phone, c.billing_email, c.notes
                ORDER BY c.display_name
                """, (rs, rowNum) -> new PropertyOwnerDto(
                rs.getObject("id", UUID.class),
                rs.getString("display_name"),
                rs.getString("email"),
                rs.getString("phone"),
                rs.getString("billing_email"),
                rs.getString("notes"),
                rs.getInt("property_count")
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
        return new PropertyOwnerDto(ownerId, request.displayName(), request.email(), request.phone(), request.billingEmail(), request.notes(), 0);
    }
}
