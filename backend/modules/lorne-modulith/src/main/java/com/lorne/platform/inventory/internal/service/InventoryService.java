package com.lorne.platform.inventory.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.inventory.internal.dto.CreateInventoryCategoryRequest;
import com.lorne.platform.inventory.internal.dto.CreateInventoryItemRequest;
import com.lorne.platform.inventory.internal.dto.InventoryCatalogResponse;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
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
        requireInventoryCategory(tenantId, request.categoryId());
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO inventory_items (tenant_id, category_id, name, unit, unit_cost, billing_cost, quantity_on_hand, reorder_level, storage_location)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                request.categoryId(),
                request.name(),
                request.unit(),
                request.unitCost(),
                request.billingCost(),
                request.quantityOnHand(),
                request.reorderLevel(),
                blankToNull(request.storageLocation())
        );
        var categoryName = categoryName(tenantId, request.categoryId());
        auditWriter.record(tenantId, actorUserId, "INVENTORY_ITEM_CREATED", "INVENTORY_ITEM", id, Map.of(
                "name", request.name(),
                "unit", request.unit(),
                "unitCost", request.unitCost() == null ? "" : request.unitCost(),
                "billingCost", request.billingCost() == null ? "" : request.billingCost(),
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
                request.unitCost(),
                request.billingCost(),
                request.quantityOnHand(),
                request.reorderLevel(),
                blankToNull(request.storageLocation()),
                true
        );
    }

    @Transactional
    public InventoryCatalogResponse.InventoryItemDto updateItem(UUID tenantId, UUID actorUserId, UUID itemId, CreateInventoryItemRequest request) {
        requireInventoryItem(tenantId, itemId);
        requireInventoryCategory(tenantId, request.categoryId());
        var updated = jdbcTemplate.update("""
                UPDATE inventory_items
                SET category_id = ?, name = ?, unit = ?, unit_cost = ?, billing_cost = ?, quantity_on_hand = ?, reorder_level = ?,
                    storage_location = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """,
                request.categoryId(),
                request.name(),
                request.unit(),
                request.unitCost(),
                request.billingCost(),
                request.quantityOnHand(),
                request.reorderLevel(),
                blankToNull(request.storageLocation()),
                actorUserId,
                tenantId,
                itemId
        );
        if (updated != 1) {
            throw new ResourceNotFoundException("Inventory item not found.");
        }
        var item = inventoryItem(tenantId, itemId);
        auditWriter.record(tenantId, actorUserId, "INVENTORY_ITEM_UPDATED", "INVENTORY_ITEM", itemId, Map.of(
                "name", item.name(),
                "unit", item.unit(),
                "unitCost", item.unitCost() == null ? "" : item.unitCost(),
                "billingCost", item.billingCost() == null ? "" : item.billingCost(),
                "quantityOnHand", item.quantityOnHand(),
                "reorderLevel", item.reorderLevel() == null ? "" : item.reorderLevel(),
                "storageLocation", item.storageLocation() == null ? "" : item.storageLocation()
        ));
        return item;
    }

    @Transactional
    public InventoryCatalogResponse.InventoryItemDto updateItemStatus(UUID tenantId, UUID actorUserId, UUID itemId, boolean active) {
        requireInventoryItem(tenantId, itemId);
        var updated = jdbcTemplate.update("""
                UPDATE inventory_items
                SET active = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, active, actorUserId, tenantId, itemId);
        if (updated != 1) {
            throw new ResourceNotFoundException("Inventory item not found.");
        }
        auditWriter.record(tenantId, actorUserId, active ? "INVENTORY_ITEM_ACTIVATED" : "INVENTORY_ITEM_DEACTIVATED", "INVENTORY_ITEM", itemId, Map.of(
                "active", active
        ));
        return inventoryItem(tenantId, itemId);
    }

    @Transactional
    public void deleteItem(UUID tenantId, UUID actorUserId, UUID itemId) {
        var item = requireInventoryItem(tenantId, itemId);
        if (hasMaterialHistory(tenantId, itemId)) {
            throw new BadRequestException("Inventory item has work order material history. Deactivate the item instead.");
        }
        jdbcTemplate.update("DELETE FROM inventory_items WHERE tenant_id = ? AND id = ?", tenantId, itemId);
        auditWriter.record(tenantId, actorUserId, "INVENTORY_ITEM_DELETED", "INVENTORY_ITEM", itemId, Map.of(
                "name", item.name()
        ));
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
                SELECT ii.id, ii.category_id, ic.name AS category_name, ii.name, ii.unit, ii.unit_cost, ii.billing_cost,
                       ii.quantity_on_hand, ii.reorder_level, ii.storage_location, ii.active
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
                rs.getBigDecimal("unit_cost"),
                rs.getBigDecimal("billing_cost"),
                rs.getBigDecimal("quantity_on_hand"),
                rs.getBigDecimal("reorder_level"),
                rs.getString("storage_location"),
                rs.getBoolean("active")
        ), tenantId);
    }

    private InventoryCatalogResponse.InventoryItemDto requireInventoryItem(UUID tenantId, UUID itemId) {
        var result = jdbcTemplate.query("""
                SELECT ii.id, ii.category_id, ic.name AS category_name, ii.name, ii.unit, ii.unit_cost, ii.billing_cost, ii.quantity_on_hand,
                       ii.reorder_level, ii.storage_location, ii.active
                FROM inventory_items ii
                LEFT JOIN inventory_categories ic ON ic.id = ii.category_id AND ic.tenant_id = ii.tenant_id
                WHERE ii.tenant_id = ? AND ii.id = ?
                """, (rs, rowNum) -> new InventoryCatalogResponse.InventoryItemDto(
                rs.getObject("id", UUID.class),
                rs.getObject("category_id", UUID.class),
                rs.getString("category_name"),
                rs.getString("name"),
                rs.getString("unit"),
                rs.getBigDecimal("unit_cost"),
                rs.getBigDecimal("billing_cost"),
                rs.getBigDecimal("quantity_on_hand"),
                rs.getBigDecimal("reorder_level"),
                rs.getString("storage_location"),
                rs.getBoolean("active")
        ), tenantId, itemId);
        if (result.isEmpty()) {
            throw new ResourceNotFoundException("Inventory item not found.");
        }
        return result.getFirst();
    }

    private InventoryCatalogResponse.InventoryItemDto inventoryItem(UUID tenantId, UUID itemId) {
        return requireInventoryItem(tenantId, itemId);
    }

    private void requireInventoryCategory(UUID tenantId, UUID categoryId) {
        if (categoryId == null) {
            return;
        }
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM inventory_categories WHERE tenant_id = ? AND id = ?)",
                Boolean.class,
                tenantId,
                categoryId
        ));
        if (!exists) {
            throw new BadRequestException("Inventory category is not available for this tenant.");
        }
    }

    private String categoryName(UUID tenantId, UUID categoryId) {
        if (categoryId == null) {
            return null;
        }
        return jdbcTemplate.queryForObject("SELECT name FROM inventory_categories WHERE tenant_id = ? AND id = ?", String.class, tenantId, categoryId);
    }

    private boolean hasMaterialHistory(UUID tenantId, UUID itemId) {
        return Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM work_order_materials
                    WHERE tenant_id = ? AND inventory_item_id = ?
                )
                """, Boolean.class, tenantId, itemId));
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
