package com.lorne.platform.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class AuditWriter {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AuditWriter(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public void record(
            UUID tenantId,
            UUID actorUserId,
            String action,
            String resourceType,
            UUID resourceId,
            Map<String, ?> metadata
    ) {
        jdbcTemplate.update("""
                INSERT INTO audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
                VALUES (?, ?, ?, ?, ?, ?::jsonb)
                """,
                tenantId,
                actorUserId,
                action,
                resourceType,
                resourceId,
                json(metadata)
        );
    }

    private String json(Map<String, ?> metadata) {
        try {
            return objectMapper.writeValueAsString(metadata == null ? Map.of() : metadata);
        } catch (JsonProcessingException exception) {
            throw new IllegalArgumentException("Audit metadata could not be serialized.", exception);
        }
    }
}
