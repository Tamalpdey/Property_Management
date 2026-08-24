package com.lorne.platform.notification.internal.controller;

import com.lorne.platform.notification.internal.dto.TestTenantEmailRequest;
import com.lorne.platform.notification.internal.dto.TestTenantEmailResponse;
import com.lorne.platform.notification.internal.service.TenantEmailTestService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/settings")
class TenantEmailTestController {
    private final TenantEmailTestService tenantEmailTestService;

    TenantEmailTestController(TenantEmailTestService tenantEmailTestService) {
        this.tenantEmailTestService = tenantEmailTestService;
    }

    @PostMapping("/test-email")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TestTenantEmailResponse> sendTestEmail(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody TestTenantEmailRequest request
    ) {
        return ApiResponse.ok(tenantEmailTestService.sendTest(principal.tenantId(), principal.userId(), request));
    }
}
