package com.lorne.platform.property.internal.controller;

import com.lorne.platform.property.internal.dto.CreatePropertyRequest;
import com.lorne.platform.property.internal.dto.PropertyDto;
import com.lorne.platform.property.internal.dto.UpdatePropertyStatusRequest;
import com.lorne.platform.property.internal.dto.UpdatePropertyServicesRequest;
import com.lorne.platform.property.internal.service.PropertyManagementService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/properties")
class PropertyManagementController {
    private final PropertyManagementService propertyManagementService;

    PropertyManagementController(PropertyManagementService propertyManagementService) {
        this.propertyManagementService = propertyManagementService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<PropertyDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(propertyManagementService.list(principal.tenantId()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreatePropertyRequest request
    ) {
        return ApiResponse.ok(propertyManagementService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{propertyId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID propertyId,
            @Valid @RequestBody CreatePropertyRequest request
    ) {
        return ApiResponse.ok(propertyManagementService.update(principal.tenantId(), principal.userId(), propertyId, request));
    }

    @PatchMapping("/{propertyId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyDto> updateStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID propertyId,
            @RequestBody UpdatePropertyStatusRequest request
    ) {
        return ApiResponse.ok(propertyManagementService.updateStatus(principal.tenantId(), principal.userId(), propertyId, request.active()));
    }

    @DeleteMapping("/{propertyId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<Void> delete(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID propertyId
    ) {
        propertyManagementService.delete(principal.tenantId(), principal.userId(), propertyId);
        return ApiResponse.ok(null);
    }

    @PutMapping("/{propertyId}/services")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyDto> updateServices(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UpdatePropertyServicesRequest request
    ) {
        return ApiResponse.ok(propertyManagementService.updateServices(principal.tenantId(), principal.userId(), propertyId, request));
    }
}
