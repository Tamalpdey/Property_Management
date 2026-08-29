package com.lorne.platform.property.internal.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.property.internal.dto.CreateServiceCategoryRequest;
import com.lorne.platform.property.internal.dto.CreateServiceTypeRequest;
import com.lorne.platform.property.internal.dto.ServiceCatalogResponse;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceCatalogService {
    private static final TypeReference<Map<String, Object>> TEMPLATE_TYPE = new TypeReference<>() {
    };
    private static final Map<String, Object> EMPTY_MAINTENANCE_RECORD_TEMPLATE = Map.of(
            "enabled", false,
            "title", "Maintenance record",
            "callTypes", List.of(),
            "checks", List.of(),
            "measurements", List.of(),
            "chemicals", List.of(),
            "deliveries", List.of(),
            "noteLabel", "Client note"
    );

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final ObjectMapper objectMapper;

    public ServiceCatalogService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.objectMapper = objectMapper;
    }

    @Transactional(readOnly = true)
    public ServiceCatalogResponse catalog(UUID tenantId) {
        return new ServiceCatalogResponse(categories(tenantId), serviceTypes(tenantId));
    }

    @Transactional
    public ServiceCatalogResponse.ServiceCategoryDto createCategory(UUID tenantId, UUID actorUserId, CreateServiceCategoryRequest request) {
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO service_categories (tenant_id, name, wsib_rate_percent, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?)
                    RETURNING id
                    """, UUID.class, tenantId, request.name(), request.wsibRatePercent(), actorUserId, actorUserId);
            auditWriter.record(tenantId, actorUserId, "SERVICE_CATEGORY_CREATED", "SERVICE_CATEGORY", id, Map.of(
                    "name", request.name(),
                    "wsibRatePercent", wsibRateText(request.wsibRatePercent())
            ));
            return new ServiceCatalogResponse.ServiceCategoryDto(id, request.name(), request.wsibRatePercent(), true);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service category already exists.");
        }
    }

    @Transactional
    public ServiceCatalogResponse.ServiceCategoryDto updateCategory(UUID tenantId, UUID actorUserId, UUID categoryId, CreateServiceCategoryRequest request) {
        requireServiceCategory(tenantId, categoryId);
        try {
            var updated = jdbcTemplate.update("""
                    UPDATE service_categories
                    SET name = ?, wsib_rate_percent = ?, updated_at = now(), updated_by = ?
                    WHERE tenant_id = ? AND id = ?
                    """,
                    request.name(),
                    request.wsibRatePercent(),
                    actorUserId,
                    tenantId,
                    categoryId
            );
            if (updated != 1) {
                throw new ResourceNotFoundException("Service category not found.");
            }
            var category = serviceCategory(tenantId, categoryId);
            auditWriter.record(tenantId, actorUserId, "SERVICE_CATEGORY_UPDATED", "SERVICE_CATEGORY", categoryId, Map.of(
                    "name", category.name(),
                    "wsibRatePercent", wsibRateText(category.wsibRatePercent())
            ));
            return category;
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service category already exists.");
        }
    }

    @Transactional
    public void deleteCategory(UUID tenantId, UUID actorUserId, UUID categoryId) {
        var category = serviceCategory(tenantId, categoryId);
        if (hasCategoryHistory(tenantId, categoryId)) {
            throw new BadRequestException("Service category has linked services. Deactivate the category instead, or move services to another category before deleting.");
        }
        jdbcTemplate.update("DELETE FROM service_categories WHERE tenant_id = ? AND id = ?", tenantId, categoryId);
        auditWriter.record(tenantId, actorUserId, "SERVICE_CATEGORY_DELETED", "SERVICE_CATEGORY", categoryId, Map.of(
                "name", category.name(),
                "wsibRatePercent", wsibRateText(category.wsibRatePercent())
        ));
    }

    @Transactional
    public ServiceCatalogResponse.ServiceCategoryDto updateCategoryStatus(UUID tenantId, UUID actorUserId, UUID categoryId, boolean active) {
        requireServiceCategory(tenantId, categoryId);
        var updated = jdbcTemplate.update("""
                UPDATE service_categories
                SET active = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, active, actorUserId, tenantId, categoryId);
        if (updated != 1) {
            throw new ResourceNotFoundException("Service category not found.");
        }
        var category = serviceCategory(tenantId, categoryId);
        auditWriter.record(tenantId, actorUserId, active ? "SERVICE_CATEGORY_ACTIVATED" : "SERVICE_CATEGORY_DEACTIVATED", "SERVICE_CATEGORY", categoryId, Map.of(
                "name", category.name(),
                "active", active
        ));
        return category;
    }

    @Transactional
    public ServiceCatalogResponse.ServiceTypeDto createServiceType(UUID tenantId, UUID actorUserId, CreateServiceTypeRequest request) {
        requireServiceCategory(tenantId, request.categoryId());
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO service_types (tenant_id, category_id, name, description, default_duration_minutes, base_price, maintenance_record_template)
                    VALUES (?, ?, ?, ?, COALESCE(?, 60), ?, ?::jsonb)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    request.categoryId(),
                    request.name(),
                    request.description(),
                    request.defaultDurationMinutes(),
                    request.basePrice(),
                    templateJson(request.maintenanceRecordTemplate())
            );
            var categoryName = request.categoryId() == null
                    ? null
                    : jdbcTemplate.queryForObject("SELECT name FROM service_categories WHERE tenant_id = ? AND id = ?", String.class, tenantId, request.categoryId());
            auditWriter.record(tenantId, actorUserId, "SERVICE_TYPE_CREATED", "SERVICE_TYPE", id, Map.of(
                    "name", request.name(),
                    "categoryId", request.categoryId() == null ? "" : request.categoryId().toString(),
                    "categoryName", categoryName == null ? "" : categoryName,
                    "defaultDurationMinutes", request.defaultDurationMinutes() == null ? 60 : request.defaultDurationMinutes(),
                    "maintenanceRecordEnabled", maintenanceRecordEnabled(request.maintenanceRecordTemplate())
            ));
            return new ServiceCatalogResponse.ServiceTypeDto(
                    id,
                    request.categoryId(),
                    categoryName,
                    request.name(),
                    request.description(),
                    request.defaultDurationMinutes() == null ? 60 : request.defaultDurationMinutes(),
                    request.basePrice(),
                    normalizedTemplate(request.maintenanceRecordTemplate()),
                    true
            );
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service type already exists.");
        }
    }

    @Transactional
    public ServiceCatalogResponse.ServiceTypeDto updateServiceType(UUID tenantId, UUID actorUserId, UUID serviceTypeId, CreateServiceTypeRequest request) {
        requireServiceType(tenantId, serviceTypeId);
        requireServiceCategory(tenantId, request.categoryId());
        try {
            var updated = jdbcTemplate.update("""
                    UPDATE service_types
                    SET category_id = ?, name = ?, description = ?, default_duration_minutes = COALESCE(?, 60),
                        base_price = ?, maintenance_record_template = ?::jsonb, updated_at = now(), updated_by = ?
                    WHERE tenant_id = ? AND id = ?
                    """,
                    request.categoryId(),
                    request.name(),
                    request.description(),
                    request.defaultDurationMinutes(),
                    request.basePrice(),
                    templateJson(request.maintenanceRecordTemplate()),
                    actorUserId,
                    tenantId,
                    serviceTypeId
            );
            if (updated != 1) {
                throw new ResourceNotFoundException("Service type not found.");
            }
            var serviceType = serviceType(tenantId, serviceTypeId);
            auditWriter.record(tenantId, actorUserId, "SERVICE_TYPE_UPDATED", "SERVICE_TYPE", serviceTypeId, Map.of(
                    "name", serviceType.name(),
                    "categoryName", serviceType.categoryName() == null ? "" : serviceType.categoryName(),
                    "defaultDurationMinutes", serviceType.defaultDurationMinutes(),
                    "maintenanceRecordEnabled", maintenanceRecordEnabled(serviceType.maintenanceRecordTemplate())
            ));
            return serviceType;
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service type already exists.");
        }
    }

    @Transactional
    public ServiceCatalogResponse.ServiceTypeDto updateServiceTypeStatus(UUID tenantId, UUID actorUserId, UUID serviceTypeId, boolean active) {
        requireServiceType(tenantId, serviceTypeId);
        var updated = jdbcTemplate.update("""
                UPDATE service_types
                SET active = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, active, actorUserId, tenantId, serviceTypeId);
        if (updated != 1) {
            throw new ResourceNotFoundException("Service type not found.");
        }
        auditWriter.record(tenantId, actorUserId, active ? "SERVICE_TYPE_ACTIVATED" : "SERVICE_TYPE_DEACTIVATED", "SERVICE_TYPE", serviceTypeId, Map.of(
                "active", active
        ));
        return serviceType(tenantId, serviceTypeId);
    }

    @Transactional
    public void deleteServiceType(UUID tenantId, UUID actorUserId, UUID serviceTypeId) {
        var serviceType = requireServiceType(tenantId, serviceTypeId);
        if (hasServiceHistory(tenantId, serviceTypeId)) {
            throw new BadRequestException("Service has property, worker, recurring, or work order history. Deactivate the service instead.");
        }
        jdbcTemplate.update("DELETE FROM service_types WHERE tenant_id = ? AND id = ?", tenantId, serviceTypeId);
        auditWriter.record(tenantId, actorUserId, "SERVICE_TYPE_DELETED", "SERVICE_TYPE", serviceTypeId, Map.of(
                "name", serviceType.name()
        ));
    }

    private List<ServiceCatalogResponse.ServiceCategoryDto> categories(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT id, name, wsib_rate_percent, active
                FROM service_categories
                WHERE tenant_id = ?
                ORDER BY name
                """, (rs, rowNum) -> new ServiceCatalogResponse.ServiceCategoryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getBigDecimal("wsib_rate_percent"),
                rs.getBoolean("active")
        ), tenantId);
    }

    private ServiceCatalogResponse.ServiceCategoryDto serviceCategory(UUID tenantId, UUID categoryId) {
        var result = jdbcTemplate.query("""
                SELECT id, name, wsib_rate_percent, active
                FROM service_categories
                WHERE tenant_id = ? AND id = ?
                """, (rs, rowNum) -> new ServiceCatalogResponse.ServiceCategoryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getBigDecimal("wsib_rate_percent"),
                rs.getBoolean("active")
        ), tenantId, categoryId);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("Service category not found.");
        }
        return result.getFirst();
    }

    private List<ServiceCatalogResponse.ServiceTypeDto> serviceTypes(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT st.id, st.category_id, sc.name AS category_name, st.name, st.description,
                       st.default_duration_minutes, st.base_price, st.maintenance_record_template::text AS maintenance_record_template, st.active
                FROM service_types st
                LEFT JOIN service_categories sc ON sc.id = st.category_id AND sc.tenant_id = st.tenant_id
                WHERE st.tenant_id = ?
                ORDER BY sc.name NULLS LAST, st.name
                """, (rs, rowNum) -> new ServiceCatalogResponse.ServiceTypeDto(
                rs.getObject("id", UUID.class),
                rs.getObject("category_id", UUID.class),
                rs.getString("category_name"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getInt("default_duration_minutes"),
                rs.getBigDecimal("base_price"),
                template(rs.getString("maintenance_record_template")),
                rs.getBoolean("active")
        ), tenantId);
    }

    private ServiceCatalogResponse.ServiceTypeDto requireServiceType(UUID tenantId, UUID serviceTypeId) {
        var result = jdbcTemplate.query("""
                SELECT st.id, st.category_id, sc.name AS category_name, st.name, st.description,
                       st.default_duration_minutes, st.base_price, st.maintenance_record_template::text AS maintenance_record_template, st.active
                FROM service_types st
                LEFT JOIN service_categories sc ON sc.id = st.category_id AND sc.tenant_id = st.tenant_id
                WHERE st.tenant_id = ? AND st.id = ?
                """, (rs, rowNum) -> new ServiceCatalogResponse.ServiceTypeDto(
                rs.getObject("id", UUID.class),
                rs.getObject("category_id", UUID.class),
                rs.getString("category_name"),
                rs.getString("name"),
                rs.getString("description"),
                rs.getInt("default_duration_minutes"),
                rs.getBigDecimal("base_price"),
                template(rs.getString("maintenance_record_template")),
                rs.getBoolean("active")
        ), tenantId, serviceTypeId);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("Service type not found.");
        }
        return result.getFirst();
    }

    private ServiceCatalogResponse.ServiceTypeDto serviceType(UUID tenantId, UUID serviceTypeId) {
        return requireServiceType(tenantId, serviceTypeId);
    }

    private void requireServiceCategory(UUID tenantId, UUID categoryId) {
        if (categoryId == null) {
            return;
        }
        var exists = jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM service_categories WHERE tenant_id = ? AND id = ?)",
                Boolean.class,
                tenantId,
                categoryId
        );
        if (!Boolean.TRUE.equals(exists)) {
            throw new ResourceNotFoundException("Service category not found.");
        }
    }

    private boolean hasServiceHistory(UUID tenantId, UUID serviceTypeId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT
                    (SELECT COUNT(*) FROM property_service_types WHERE tenant_id = ? AND service_type_id = ?) +
                    (SELECT COUNT(*) FROM worker_service_skills WHERE tenant_id = ? AND service_type_id = ?) +
                    (SELECT COUNT(*) FROM recurring_work_templates WHERE tenant_id = ? AND service_type_id = ?) +
                    (SELECT COUNT(*) FROM work_orders WHERE tenant_id = ? AND service_type_id = ?)
                """, Long.class,
                tenantId, serviceTypeId,
                tenantId, serviceTypeId,
                tenantId, serviceTypeId,
                tenantId, serviceTypeId
        );
        return count != null && count > 0;
    }

    private boolean hasCategoryHistory(UUID tenantId, UUID categoryId) {
        var count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM service_types WHERE tenant_id = ? AND category_id = ?",
                Long.class,
                tenantId,
                categoryId
        );
        return count != null && count > 0;
    }

    private String wsibRateText(BigDecimal rate) {
        return rate == null ? "" : rate.stripTrailingZeros().toPlainString();
    }

    private String templateJson(Map<String, Object> template) {
        try {
            return objectMapper.writeValueAsString(normalizedTemplate(template));
        } catch (Exception exception) {
            throw new BadRequestException("Maintenance record template is not valid.");
        }
    }

    private Map<String, Object> template(String value) {
        try {
            return normalizedTemplate(objectMapper.readValue(value == null ? "{}" : value, TEMPLATE_TYPE));
        } catch (Exception exception) {
            return EMPTY_MAINTENANCE_RECORD_TEMPLATE;
        }
    }

    private Map<String, Object> normalizedTemplate(Map<String, Object> template) {
        if (template == null || template.isEmpty()) {
            return EMPTY_MAINTENANCE_RECORD_TEMPLATE;
        }
        var normalized = new java.util.LinkedHashMap<String, Object>();
        normalized.put("enabled", Boolean.TRUE.equals(template.get("enabled")));
        normalized.put("title", stringOrDefault(template.get("title"), "Maintenance record"));
        normalized.put("callTypes", listOrEmpty(template.get("callTypes")));
        normalized.put("checks", listOrEmpty(template.get("checks")));
        normalized.put("measurements", listOrEmpty(template.get("measurements")));
        normalized.put("chemicals", listOrEmpty(template.get("chemicals")));
        normalized.put("deliveries", listOrEmpty(template.get("deliveries")));
        normalized.put("noteLabel", stringOrDefault(template.get("noteLabel"), "Client note"));
        return normalized;
    }

    private boolean maintenanceRecordEnabled(Map<String, Object> template) {
        return Boolean.TRUE.equals(normalizedTemplate(template).get("enabled"));
    }

    private List<?> listOrEmpty(Object value) {
        return value instanceof List<?> list ? list : List.of();
    }

    private String stringOrDefault(Object value, String fallback) {
        if (value instanceof String text && !text.isBlank()) {
            return text.trim();
        }
        return fallback;
    }
}
