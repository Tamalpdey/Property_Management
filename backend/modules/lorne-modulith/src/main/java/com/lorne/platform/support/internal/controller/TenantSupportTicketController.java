package com.lorne.platform.support.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.*;
import com.lorne.platform.support.internal.service.SupportTicketService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/tenant/support-tickets")
@PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
class TenantSupportTicketController {
    private final SupportTicketService service;
    TenantSupportTicketController(SupportTicketService service) { this.service = service; }
    @GetMapping ApiResponse<Page> list(@AuthenticationPrincipal JwtPrincipal principal, @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority, @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return ApiResponse.ok(service.list(scope(principal), status, priority, query, page, size));
    }
    @GetMapping("/{id}") ApiResponse<Detail> detail(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id) {
        return ApiResponse.ok(service.detail(principal.tenantId(), id, false));
    }
    @PostMapping ApiResponse<Detail> create(@AuthenticationPrincipal JwtPrincipal principal, @Valid @RequestBody Create request) {
        return ApiResponse.ok(service.create(principal.tenantId(), principal.userId(), request));
    }
    @PostMapping("/{id}/messages") ApiResponse<Detail> reply(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id, @Valid @RequestBody Reply request) {
        return ApiResponse.ok(service.reply(principal.tenantId(), principal.userId(), id, request.body(), false, false));
    }
    @PostMapping("/{id}/close") ApiResponse<Detail> close(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id, @Valid @RequestBody Close request) {
        return ApiResponse.ok(service.close(principal.tenantId(), principal.userId(), id, request.version()));
    }
    private UUID scope(JwtPrincipal principal) {
        if (principal.tenantId() == null) throw new org.springframework.security.access.AccessDeniedException("Tenant scope is required.");
        return principal.tenantId();
    }
}
