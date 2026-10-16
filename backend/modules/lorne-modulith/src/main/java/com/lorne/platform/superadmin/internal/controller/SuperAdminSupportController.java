package com.lorne.platform.superadmin.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.superadmin.internal.dto.PlatformAuditPage;
import com.lorne.platform.superadmin.internal.dto.TenantHealthReport;
import com.lorne.platform.superadmin.internal.dto.TenantSupportNote;
import com.lorne.platform.superadmin.internal.dto.TenantOperationsOverview;
import com.lorne.platform.superadmin.internal.service.PlatformSupportService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/superadmin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
class SuperAdminSupportController {
    private final PlatformSupportService support;
    SuperAdminSupportController(PlatformSupportService support) { this.support = support; }

    @GetMapping("/tenants/{tenantId}/health")
    ApiResponse<TenantHealthReport> health(@PathVariable UUID tenantId) { return ApiResponse.ok(support.health(tenantId)); }

    @GetMapping("/tenants/{tenantId}/operations")
    ApiResponse<TenantOperationsOverview> operations(@PathVariable UUID tenantId) { return ApiResponse.ok(support.operations(tenantId)); }

    @GetMapping("/tenants/{tenantId}/support-notes")
    ApiResponse<List<TenantSupportNote>> notes(@PathVariable UUID tenantId) { return ApiResponse.ok(support.notes(tenantId)); }

    @PostMapping("/tenants/{tenantId}/support-notes")
    ApiResponse<List<TenantSupportNote>> addNote(@PathVariable UUID tenantId, @AuthenticationPrincipal JwtPrincipal principal,
                                               @Valid @RequestBody TenantSupportNote.Request request) {
        return ApiResponse.ok(support.addNote(tenantId, principal.userId(), request.note()));
    }

    @GetMapping("/audit")
    ApiResponse<PlatformAuditPage> audit(@RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) String query, @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant until, @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size) {
        return ApiResponse.ok(support.audit(tenantId, query, from, until, page, size));
    }
}
