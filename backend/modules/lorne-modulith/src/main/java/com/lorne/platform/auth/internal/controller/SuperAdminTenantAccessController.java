package com.lorne.platform.auth.internal.controller;

import com.lorne.platform.auth.internal.dto.TenantUserDto;
import com.lorne.platform.auth.internal.dto.UpdateTenantPortalAccessRequest;
import com.lorne.platform.auth.internal.service.TenantUserManagementService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/superadmin/tenants/{tenantId}/users")
@PreAuthorize("hasRole('SUPER_ADMIN')")
class SuperAdminTenantAccessController {
    private final TenantUserManagementService users;

    SuperAdminTenantAccessController(TenantUserManagementService users) { this.users = users; }

    @GetMapping
    ApiResponse<List<TenantUserDto>> list(@PathVariable UUID tenantId) {
        return ApiResponse.ok(users.list(tenantId));
    }

    @PatchMapping("/{userId}/portal-access")
    ApiResponse<TenantUserDto> update(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID tenantId,
                                     @PathVariable UUID userId, @Valid @RequestBody UpdateTenantPortalAccessRequest request) {
        return ApiResponse.ok(users.updatePortalAccess(tenantId, principal.userId(), userId, request));
    }
}
