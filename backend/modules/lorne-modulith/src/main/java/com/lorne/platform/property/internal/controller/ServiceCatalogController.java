package com.lorne.platform.property.internal.controller;

import com.lorne.platform.property.internal.dto.CreateServiceCategoryRequest;
import com.lorne.platform.property.internal.dto.CreateServiceTypeRequest;
import com.lorne.platform.property.internal.dto.ServiceCatalogResponse;
import com.lorne.platform.property.internal.service.ServiceCatalogService;
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
@RequestMapping("/api/v1/tenant/service-catalog")
class ServiceCatalogController {
    private final ServiceCatalogService serviceCatalogService;

    ServiceCatalogController(ServiceCatalogService serviceCatalogService) {
        this.serviceCatalogService = serviceCatalogService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<ServiceCatalogResponse> catalog(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(serviceCatalogService.catalog(principal.tenantId()));
    }

    @PostMapping("/categories")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<ServiceCatalogResponse.ServiceCategoryDto> createCategory(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateServiceCategoryRequest request
    ) {
        return ApiResponse.ok(serviceCatalogService.createCategory(principal.tenantId(), principal.userId(), request));
    }

    @PostMapping("/types")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<ServiceCatalogResponse.ServiceTypeDto> createServiceType(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateServiceTypeRequest request
    ) {
        return ApiResponse.ok(serviceCatalogService.createServiceType(principal.tenantId(), principal.userId(), request));
    }
}
