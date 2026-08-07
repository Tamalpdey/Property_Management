package com.lorne.platform.asset.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.asset.internal.dto.AssetCatalogResponse;
import com.lorne.platform.asset.internal.dto.CreateAssetRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AssetService {
    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;

    public AssetService(JdbcTemplate jdbcTemplate, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public AssetCatalogResponse catalog(UUID tenantId) {
        return new AssetCatalogResponse(assets(tenantId), workers(tenantId));
    }

    @Transactional
    public AssetCatalogResponse.AssetDto create(UUID tenantId, UUID actorUserId, CreateAssetRequest request) {
        requireTenantWorker(tenantId, request.assignedWorkerId());
        var id = jdbcTemplate.queryForObject("""
                INSERT INTO assets (tenant_id, asset_type, name, identifier, quantity_on_hand, storage_location, assigned_worker_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                request.assetType(),
                request.name(),
                request.identifier(),
                request.quantityOnHand() == null ? BigDecimal.ONE : request.quantityOnHand(),
                blankToNull(request.storageLocation()),
                request.assignedWorkerId()
        );
        auditWriter.record(tenantId, actorUserId, "ASSET_CREATED", "ASSET", id, Map.of(
                "name", request.name(),
                "assetType", request.assetType(),
                "identifier", request.identifier() == null ? "" : request.identifier(),
                "quantityOnHand", request.quantityOnHand() == null ? BigDecimal.ONE : request.quantityOnHand(),
                "storageLocation", request.storageLocation() == null ? "" : request.storageLocation(),
                "assignedWorkerId", request.assignedWorkerId() == null ? "" : request.assignedWorkerId().toString()
        ));
        return asset(tenantId, id);
    }

    private void requireTenantWorker(UUID tenantId, UUID workerId) {
        if (workerId == null) {
            return;
        }
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM workers WHERE tenant_id = ? AND id = ?)",
                Boolean.class,
                tenantId,
                workerId
        ));
        if (!exists) {
            throw new BadRequestException("Assigned worker is not available for this tenant.");
        }
    }

    private AssetCatalogResponse.AssetDto asset(UUID tenantId, UUID assetId) {
        return jdbcTemplate.query("""
                SELECT a.id, a.asset_type, a.name, a.identifier, a.quantity_on_hand, a.storage_location, a.assigned_worker_id,
                       w.display_name AS assigned_worker_name, a.active
                FROM assets a
                LEFT JOIN workers w ON w.id = a.assigned_worker_id AND w.tenant_id = a.tenant_id
                WHERE a.tenant_id = ? AND a.id = ?
                """, rs -> {
            if (!rs.next()) {
                throw new BadRequestException("Asset could not be created.");
            }
            return new AssetCatalogResponse.AssetDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("asset_type"),
                    rs.getString("name"),
                    rs.getString("identifier"),
                    rs.getBigDecimal("quantity_on_hand"),
                    rs.getString("storage_location"),
                    rs.getObject("assigned_worker_id", UUID.class),
                    rs.getString("assigned_worker_name"),
                    rs.getBoolean("active")
            );
        }, tenantId, assetId);
    }

    private java.util.List<AssetCatalogResponse.AssetDto> assets(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT a.id, a.asset_type, a.name, a.identifier, a.quantity_on_hand, a.storage_location, a.assigned_worker_id,
                       w.display_name AS assigned_worker_name, a.active
                FROM assets a
                LEFT JOIN workers w ON w.id = a.assigned_worker_id AND w.tenant_id = a.tenant_id
                WHERE a.tenant_id = ?
                ORDER BY a.storage_location NULLS LAST, a.asset_type, a.name
                """, (rs, rowNum) -> new AssetCatalogResponse.AssetDto(
                rs.getObject("id", UUID.class),
                rs.getString("asset_type"),
                rs.getString("name"),
                rs.getString("identifier"),
                rs.getBigDecimal("quantity_on_hand"),
                rs.getString("storage_location"),
                rs.getObject("assigned_worker_id", UUID.class),
                rs.getString("assigned_worker_name"),
                rs.getBoolean("active")
        ), tenantId);
    }

    private java.util.List<AssetCatalogResponse.WorkerOptionDto> workers(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT id, display_name, employee_number
                FROM workers
                WHERE tenant_id = ? AND status = 'ACTIVE'
                ORDER BY display_name
                """, (rs, rowNum) -> new AssetCatalogResponse.WorkerOptionDto(
                rs.getObject("id", UUID.class),
                rs.getString("display_name"),
                rs.getString("employee_number")
        ), tenantId);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
