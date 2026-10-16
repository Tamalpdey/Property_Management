package com.lorne.platform.superadmin.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.superadmin.internal.dto.CreateTenantOnboardingRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantSummary;
import com.lorne.platform.superadmin.internal.dto.TenantOnboardingResponse;
import com.lorne.platform.superadmin.internal.dto.UpdateTenantModuleRequest;
import com.lorne.platform.superadmin.internal.dto.UpdateTenantRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantDetail;
import com.lorne.platform.superadmin.internal.dto.TenantAdministrationEvent;
import com.lorne.platform.superadmin.internal.dto.SetTenantAccessRequest;
import com.lorne.platform.superadmin.internal.service.TenantOnboardingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/superadmin/tenants")
class SuperAdminTenantController {
    private final TenantOnboardingService tenantOnboardingService;

    SuperAdminTenantController(TenantOnboardingService tenantOnboardingService) {
        this.tenantOnboardingService = tenantOnboardingService;
    }

    @GetMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<List<SuperAdminTenantSummary>> list() {
        return ApiResponse.ok(tenantOnboardingService.list());
    }

    @PostMapping
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<TenantOnboardingResponse> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateTenantOnboardingRequest request
    ) {
        return ApiResponse.ok(tenantOnboardingService.create(principal.userId(), request));
    }

    @GetMapping("/{tenantId}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<SuperAdminTenantDetail> detail(@PathVariable java.util.UUID tenantId) {
        return ApiResponse.ok(tenantOnboardingService.detail(tenantId));
    }

    @PatchMapping("/{tenantId}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<SuperAdminTenantDetail> update(@AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable java.util.UUID tenantId, @Valid @RequestBody UpdateTenantRequest request) {
        return ApiResponse.ok(tenantOnboardingService.update(principal.userId(), tenantId, request));
    }

    @GetMapping("/{tenantId}/history")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<List<TenantAdministrationEvent>> history(@PathVariable java.util.UUID tenantId) {
        return ApiResponse.ok(tenantOnboardingService.history(tenantId));
    }

    @PatchMapping("/{tenantId}/access")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<SuperAdminTenantSummary> setAccess(@AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable java.util.UUID tenantId, @Valid @RequestBody SetTenantAccessRequest request) {
        return ApiResponse.ok(tenantOnboardingService.setAccess(principal.userId(), tenantId, request.active(), request.reason()));
    }

    @PatchMapping("/{tenantId}/modules/{moduleCode}")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<SuperAdminTenantSummary> updateModule(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable java.util.UUID tenantId,
            @PathVariable String moduleCode,
            @Valid @RequestBody UpdateTenantModuleRequest request
    ) {
        return ApiResponse.ok(tenantOnboardingService.updateModule(principal.userId(), tenantId, moduleCode, request.enabled()));
    }
}
