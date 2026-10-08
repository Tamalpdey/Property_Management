package com.lorne.platform.tenant.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.tenant.TenantLoginBrandingDto;
import com.lorne.platform.tenant.internal.service.TenantSettingsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/tenant-branding")
class PublicTenantBrandingController {
    private final TenantSettingsService tenantSettingsService;

    PublicTenantBrandingController(TenantSettingsService tenantSettingsService) {
        this.tenantSettingsService = tenantSettingsService;
    }

    @GetMapping
    ApiResponse<TenantLoginBrandingDto> get(@RequestParam String tenant) {
        return ApiResponse.ok(tenantSettingsService.loginBranding(tenant));
    }
}
