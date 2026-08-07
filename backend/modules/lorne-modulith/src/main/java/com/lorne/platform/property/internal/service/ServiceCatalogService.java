package com.lorne.platform.property.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.property.internal.dto.CreateServiceCategoryRequest;
import com.lorne.platform.property.internal.dto.CreateServiceTypeRequest;
import com.lorne.platform.property.internal.dto.ServiceCatalogResponse;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ServiceCatalogService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public ServiceCatalogService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public ServiceCatalogResponse catalog(UUID tenantId) {
        return new ServiceCatalogResponse(categories(tenantId), serviceTypes(tenantId));
    }

    @Transactional
    public ServiceCatalogResponse.ServiceCategoryDto createCategory(UUID tenantId, UUID actorUserId, CreateServiceCategoryRequest request) {
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO service_categories (tenant_id, name)
                    VALUES (?, ?)
                    RETURNING id
                    """, UUID.class, tenantId, request.name());
            auditWriter.record(tenantId, actorUserId, "SERVICE_CATEGORY_CREATED", "SERVICE_CATEGORY", id, Map.of(
                    "name", request.name()
            ));
            return new ServiceCatalogResponse.ServiceCategoryDto(id, request.name(), true);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service category already exists.");
        }
    }

    @Transactional
    public ServiceCatalogResponse.ServiceTypeDto createServiceType(UUID tenantId, UUID actorUserId, CreateServiceTypeRequest request) {
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO service_types (tenant_id, category_id, name, description, default_duration_minutes, base_price)
                    VALUES (?, ?, ?, ?, COALESCE(?, 60), ?)
                    RETURNING id
                    """, UUID.class,
                    tenantId,
                    request.categoryId(),
                    request.name(),
                    request.description(),
                    request.defaultDurationMinutes(),
                    request.basePrice()
            );
            var categoryName = request.categoryId() == null
                    ? null
                    : jdbcTemplate.queryForObject("SELECT name FROM service_categories WHERE tenant_id = ? AND id = ?", String.class, tenantId, request.categoryId());
            auditWriter.record(tenantId, actorUserId, "SERVICE_TYPE_CREATED", "SERVICE_TYPE", id, Map.of(
                    "name", request.name(),
                    "categoryId", request.categoryId() == null ? "" : request.categoryId().toString(),
                    "categoryName", categoryName == null ? "" : categoryName,
                    "defaultDurationMinutes", request.defaultDurationMinutes() == null ? 60 : request.defaultDurationMinutes()
            ));
            return new ServiceCatalogResponse.ServiceTypeDto(
                    id,
                    request.categoryId(),
                    categoryName,
                    request.name(),
                    request.description(),
                    request.defaultDurationMinutes() == null ? 60 : request.defaultDurationMinutes(),
                    request.basePrice(),
                    true
            );
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Service type already exists.");
        }
    }

    private List<ServiceCatalogResponse.ServiceCategoryDto> categories(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT id, name, active
                FROM service_categories
                WHERE tenant_id = ?
                ORDER BY name
                """, (rs, rowNum) -> new ServiceCatalogResponse.ServiceCategoryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name"),
                rs.getBoolean("active")
        ), tenantId);
    }

    private List<ServiceCatalogResponse.ServiceTypeDto> serviceTypes(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT st.id, st.category_id, sc.name AS category_name, st.name, st.description,
                       st.default_duration_minutes, st.base_price, st.active
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
                rs.getBoolean("active")
        ), tenantId);
    }
}
