package com.lorne.platform.audit.internal.controller;

import com.lorne.platform.audit.internal.dto.AuditLogDto;
import com.lorne.platform.audit.internal.service.TenantAuditService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/audit-logs")
class TenantAuditController {
    private final TenantAuditService tenantAuditService;

    TenantAuditController(TenantAuditService tenantAuditService) {
        this.tenantAuditService = tenantAuditService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<AuditLogDto>> list(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(defaultValue = "250") int limit,
            @RequestParam(required = false) String resourceType,
            @RequestParam(required = false) UUID resourceId
    ) {
        return ApiResponse.ok(tenantAuditService.list(principal.tenantId(), limit, resourceType, resourceId));
    }
}
