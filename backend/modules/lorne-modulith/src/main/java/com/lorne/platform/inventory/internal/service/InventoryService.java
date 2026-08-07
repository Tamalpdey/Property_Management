package com.lorne.platform.inventory.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.inventory.internal.dto.CreateInventoryCategoryRequest;
import com.lorne.platform.inventory.internal.dto.CreateInventoryItemRequest;
import com.lorne.platform.inventory.internal.dto.InventoryCatalogResponse;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public InventoryService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public InventoryCatalogResponse catalog(UUID tenantId) {
        return new InventoryCatalogResponse(categories(tenantId), items(tenantId));
    }

    @Transactional
    public InventoryCatalogResponse.InventoryCategoryDto createCategory(UUID tenantId, UUID actorUserId, CreateInventoryCategoryRequest request) {
        try {
            var id = jdbcTemplate.queryForObject("""
                    INSERT INTO inventory_categories (tenant_id, name)
                    VALUES (?, ?)
                    RETURNING id
                    """, UUID.class, tenantId, request.name());
            auditWriter.record(tenantId, actorUserId, "INVENTORY_CATEGORY_CREATED", "INVENTORY_CATEGORY", id, Map.of(
                    "name", request.name()
            ));
            return new InventoryCatalogResponse.InventoryCategoryDto(id, request.name());
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Inventory category already exists.");
        }
    }

    @Transactional
    public InventoryCatalogResponse.InventoryItemDto createItem(UUID tenantId, UUID actorUserId, CreateInventoryItemRequest request) {
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO inventory_items (tenant_id, category_id, name, unit, quantity_on_hand, reorder_level, storage_location)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                request.categoryId(),
                request.name(),
                request.unit(),
                request.quantityOnHand(),
                request.reorderLevel(),
                blankToNull(request.storageLocation())
        );
        var categoryName = request.categoryId() == null
                ? null
                : jdbcTemplate.queryForObject("SELECT name FROM inventory_categories WHERE tenant_id = ? AND id = ?", String.class, tenantId, request.categoryId());
        auditWriter.record(tenantId, actorUserId, "INVENTORY_ITEM_CREATED", "INVENTORY_ITEM", id, Map.of(
                "name", request.name(),
                "unit", request.unit(),
                "quantityOnHand", request.quantityOnHand(),
                "reorderLevel", request.reorderLevel() == null ? "" : request.reorderLevel(),
                "categoryName", categoryName == null ? "" : categoryName,
                "storageLocation", request.storageLocation() == null ? "" : request.storageLocation()
        ));
        return new InventoryCatalogResponse.InventoryItemDto(
                id,
                request.categoryId(),
                categoryName,
                request.name(),
                request.unit(),
                request.quantityOnHand(),
                request.reorderLevel(),
                blankToNull(request.storageLocation())
        );
    }

    private java.util.List<InventoryCatalogResponse.InventoryCategoryDto> categories(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT id, name
                FROM inventory_categories
                WHERE tenant_id = ?
                ORDER BY name
                """, (rs, rowNum) -> new InventoryCatalogResponse.InventoryCategoryDto(
                rs.getObject("id", UUID.class),
                rs.getString("name")
        ), tenantId);
    }

    private java.util.List<InventoryCatalogResponse.InventoryItemDto> items(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT ii.id, ii.category_id, ic.name AS category_name, ii.name, ii.unit, ii.quantity_on_hand, ii.reorder_level, ii.storage_location
                FROM inventory_items ii
                LEFT JOIN inventory_categories ic ON ic.id = ii.category_id AND ic.tenant_id = ii.tenant_id
                WHERE ii.tenant_id = ?
                ORDER BY ii.storage_location NULLS LAST, ic.name NULLS LAST, ii.name
                """, (rs, rowNum) -> new InventoryCatalogResponse.InventoryItemDto(
                rs.getObject("id", UUID.class),
                rs.getObject("category_id", UUID.class),
                rs.getString("category_name"),
                rs.getString("name"),
                rs.getString("unit"),
                rs.getBigDecimal("quantity_on_hand"),
                rs.getBigDecimal("reorder_level"),
                rs.getString("storage_location")
        ), tenantId);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
