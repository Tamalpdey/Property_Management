package com.lorne.platform.audit.internal.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.internal.dto.AuditLogDto;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantAuditService {
    private static final int MAX_LIMIT = 500;
    private static final TypeReference<Map<String, Object>> METADATA_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public TenantAuditService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public List<AuditLogDto> list(UUID tenantId, int requestedLimit, String resourceType, UUID resourceId) {
        var limit = Math.max(1, Math.min(requestedLimit, MAX_LIMIT));
        var filteredByResource = resourceType != null && !resourceType.isBlank() && resourceId != null;
        return jdbcTemplate.query("""
                SELECT al.id, al.tenant_id, al.actor_user_id, au.display_name AS actor_name, au.email AS actor_email,
                       al.action, al.resource_type, al.resource_id, al.metadata::text AS metadata, al.created_at
                FROM audit_logs al
                LEFT JOIN app_users au ON au.id = al.actor_user_id
                WHERE al.tenant_id = ?
                  AND (? = false OR (al.resource_type = ? AND al.resource_id = ?))
                ORDER BY al.created_at DESC
                LIMIT ?
                """, (rs, rowNum) -> new AuditLogDto(
                rs.getObject("id", UUID.class),
                rs.getObject("tenant_id", UUID.class),
                rs.getObject("actor_user_id", UUID.class),
                rs.getString("actor_name"),
                rs.getString("actor_email"),
                rs.getString("action"),
                rs.getString("resource_type"),
                rs.getObject("resource_id", UUID.class),
                metadata(rs.getString("metadata")),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId, filteredByResource, resourceType, resourceId, limit);
    }

    private Map<String, Object> metadata(String value) {
        try {
            return objectMapper.readValue(value == null ? "{}" : value, METADATA_TYPE);
        } catch (Exception exception) {
            return Map.of("raw", value == null ? "{}" : value);
        }
    }
}
