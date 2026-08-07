package com.lorne.platform.property.internal.controller;

import com.lorne.platform.property.internal.dto.CreatePropertyRequest;
import com.lorne.platform.property.internal.dto.PropertyDto;
import com.lorne.platform.property.internal.dto.UpdatePropertyServicesRequest;
import com.lorne.platform.property.internal.service.PropertyManagementService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
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
