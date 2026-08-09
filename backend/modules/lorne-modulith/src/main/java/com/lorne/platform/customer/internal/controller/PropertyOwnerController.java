package com.lorne.platform.customer.internal.controller;

import com.lorne.platform.customer.internal.dto.CreatePropertyOwnerRequest;
import com.lorne.platform.customer.internal.dto.PropertyOwnerDto;
import com.lorne.platform.customer.internal.dto.UpdatePropertyOwnerStatusRequest;
import com.lorne.platform.customer.internal.service.PropertyOwnerService;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/property-owners")
class PropertyOwnerController {
    private final PropertyOwnerService propertyOwnerService;

    PropertyOwnerController(PropertyOwnerService propertyOwnerService) {
        this.propertyOwnerService = propertyOwnerService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<PropertyOwnerDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(propertyOwnerService.list(principal.tenantId()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyOwnerDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreatePropertyOwnerRequest request
    ) {
        return ApiResponse.ok(propertyOwnerService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{ownerId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyOwnerDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID ownerId,
            @Valid @RequestBody CreatePropertyOwnerRequest request
    ) {
        return ApiResponse.ok(propertyOwnerService.update(principal.tenantId(), principal.userId(), ownerId, request));
    }

    @PatchMapping("/{ownerId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PropertyOwnerDto> updateStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID ownerId,
            @RequestBody UpdatePropertyOwnerStatusRequest request
    ) {
        return ApiResponse.ok(propertyOwnerService.updateStatus(principal.tenantId(), principal.userId(), ownerId, request.active()));
    }

    @DeleteMapping("/{ownerId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<Void> delete(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID ownerId
    ) {
        propertyOwnerService.delete(principal.tenantId(), principal.userId(), ownerId);
        return ApiResponse.ok(null);
    }
}
