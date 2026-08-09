package com.lorne.platform.auth.internal.controller;

import com.lorne.platform.auth.internal.dto.CreateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.TenantRoleDto;
import com.lorne.platform.auth.internal.dto.TenantUserDto;
import com.lorne.platform.auth.internal.dto.UpdateTenantUserRequest;
import com.lorne.platform.auth.internal.service.TenantUserManagementService;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/users")
class TenantUserManagementController {
    private final TenantUserManagementService tenantUserManagementService;

    TenantUserManagementController(TenantUserManagementService tenantUserManagementService) {
        this.tenantUserManagementService = tenantUserManagementService;
    }

    @GetMapping
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<List<TenantUserDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(tenantUserManagementService.list(principal.tenantId()));
    }

    @GetMapping("/roles")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<List<TenantRoleDto>> roles() {
        return ApiResponse.ok(tenantUserManagementService.roles());
    }

    @PostMapping
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TenantUserDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateTenantUserRequest request
    ) {
        return ApiResponse.ok(tenantUserManagementService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{userId}")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TenantUserDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateTenantUserRequest request
    ) {
        return ApiResponse.ok(tenantUserManagementService.update(principal.tenantId(), principal.userId(), userId, request));
    }

    @PostMapping("/{userId}/activate")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TenantUserDto> activate(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID userId
    ) {
        return ApiResponse.ok(tenantUserManagementService.updateStatus(principal.tenantId(), principal.userId(), userId, "ACTIVE"));
    }

    @PostMapping("/{userId}/deactivate")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TenantUserDto> deactivate(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID userId
    ) {
        return ApiResponse.ok(tenantUserManagementService.updateStatus(principal.tenantId(), principal.userId(), userId, "DISABLED"));
    }

    @DeleteMapping("/{userId}")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<Void> delete(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID userId
    ) {
        tenantUserManagementService.delete(principal.tenantId(), principal.userId(), userId);
        return ApiResponse.ok(null);
    }
}
