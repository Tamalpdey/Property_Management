package com.lorne.platform.inventory.internal.controller;

import com.lorne.platform.inventory.internal.dto.CreateInventoryCategoryRequest;
import com.lorne.platform.inventory.internal.dto.CreateInventoryItemRequest;
import com.lorne.platform.inventory.internal.dto.InventoryCatalogResponse;
import com.lorne.platform.inventory.internal.service.InventoryService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
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
}
