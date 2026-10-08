package com.lorne.platform.superadmin.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.superadmin.internal.dto.CreateTenantOnboardingRequest;
import com.lorne.platform.superadmin.internal.dto.SuperAdminTenantSummary;
import com.lorne.platform.superadmin.internal.dto.TenantOnboardingResponse;
import com.lorne.platform.superadmin.internal.service.TenantOnboardingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
}
