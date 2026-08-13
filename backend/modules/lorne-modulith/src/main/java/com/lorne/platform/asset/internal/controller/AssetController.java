package com.lorne.platform.asset.internal.controller;

import com.lorne.platform.asset.internal.dto.AssetCatalogResponse;
import com.lorne.platform.asset.internal.dto.CreateAssetRequest;
import com.lorne.platform.asset.internal.dto.UpdateAssetStatusRequest;
import com.lorne.platform.asset.internal.service.AssetService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/assets")
class AssetController {
    private final AssetService assetService;

    AssetController(AssetService assetService) {
        this.assetService = assetService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<AssetCatalogResponse> catalog(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(assetService.catalog(principal.tenantId()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<AssetCatalogResponse.AssetDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateAssetRequest request
    ) {
        return ApiResponse.ok(assetService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{assetId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<AssetCatalogResponse.AssetDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID assetId,
            @Valid @RequestBody CreateAssetRequest request
    ) {
        return ApiResponse.ok(assetService.update(principal.tenantId(), principal.userId(), assetId, request));
    }

    @PatchMapping("/{assetId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<AssetCatalogResponse.AssetDto> updateStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID assetId,
            @RequestBody UpdateAssetStatusRequest request
    ) {
        return ApiResponse.ok(assetService.updateStatus(principal.tenantId(), principal.userId(), assetId, request.active()));
    }

    @DeleteMapping("/{assetId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<Void> delete(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID assetId
    ) {
        assetService.delete(principal.tenantId(), principal.userId(), assetId);
        return ApiResponse.ok(null);
    }
}
