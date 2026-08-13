package com.lorne.platform.inventory.internal.controller;

import com.lorne.platform.inventory.internal.dto.CreateInventoryCategoryRequest;
import com.lorne.platform.inventory.internal.dto.CreateInventoryItemRequest;
import com.lorne.platform.inventory.internal.dto.InventoryCatalogResponse;
import com.lorne.platform.inventory.internal.dto.UpdateInventoryItemStatusRequest;
import com.lorne.platform.inventory.internal.service.InventoryService;
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
@RequestMapping("/api/v1/tenant/inventory")
class InventoryController {
    private final InventoryService inventoryService;

    InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<InventoryCatalogResponse> catalog(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(inventoryService.catalog(principal.tenantId()));
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<InventoryCatalogResponse.InventoryCategoryDto> createCategory(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateInventoryCategoryRequest request
    ) {
        return ApiResponse.ok(inventoryService.createCategory(principal.tenantId(), principal.userId(), request));
    }

    @PostMapping("/items")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<InventoryCatalogResponse.InventoryItemDto> createItem(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateInventoryItemRequest request
    ) {
        return ApiResponse.ok(inventoryService.createItem(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/items/{itemId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<InventoryCatalogResponse.InventoryItemDto> updateItem(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID itemId,
            @Valid @RequestBody CreateInventoryItemRequest request
    ) {
        return ApiResponse.ok(inventoryService.updateItem(principal.tenantId(), principal.userId(), itemId, request));
    }

    @PatchMapping("/items/{itemId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<InventoryCatalogResponse.InventoryItemDto> updateItemStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID itemId,
            @RequestBody UpdateInventoryItemStatusRequest request
    ) {
        return ApiResponse.ok(inventoryService.updateItemStatus(principal.tenantId(), principal.userId(), itemId, request.active()));
    }

    @DeleteMapping("/items/{itemId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<Void> deleteItem(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID itemId
    ) {
        inventoryService.deleteItem(principal.tenantId(), principal.userId(), itemId);
        return ApiResponse.ok(null);
    }
}
