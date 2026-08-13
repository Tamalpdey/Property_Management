package com.lorne.platform.property.internal.controller;

import com.lorne.platform.property.internal.dto.CreateServiceCategoryRequest;
import com.lorne.platform.property.internal.dto.CreateServiceTypeRequest;
import com.lorne.platform.property.internal.dto.ServiceCatalogResponse;
import com.lorne.platform.property.internal.dto.UpdateServiceTypeStatusRequest;
import com.lorne.platform.property.internal.service.ServiceCatalogService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

    @PatchMapping("/types/{serviceTypeId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<ServiceCatalogResponse.ServiceTypeDto> updateServiceType(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID serviceTypeId,
            @Valid @RequestBody CreateServiceTypeRequest request
    ) {
        return ApiResponse.ok(serviceCatalogService.updateServiceType(principal.tenantId(), principal.userId(), serviceTypeId, request));
    }

    @PatchMapping("/types/{serviceTypeId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<ServiceCatalogResponse.ServiceTypeDto> updateServiceTypeStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID serviceTypeId,
            @RequestBody UpdateServiceTypeStatusRequest request
    ) {
        return ApiResponse.ok(serviceCatalogService.updateServiceTypeStatus(principal.tenantId(), principal.userId(), serviceTypeId, request.active()));
    }

    @DeleteMapping("/types/{serviceTypeId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<Void> deleteServiceType(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID serviceTypeId
    ) {
        serviceCatalogService.deleteServiceType(principal.tenantId(), principal.userId(), serviceTypeId);
        return ApiResponse.ok(null);
    }
}
