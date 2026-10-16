package com.lorne.platform.support.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.*;
import com.lorne.platform.support.internal.service.SupportTicketService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/superadmin/support-tickets")
@PreAuthorize("hasRole('SUPER_ADMIN')")
class PlatformSupportTicketController {
    private final SupportTicketService service;
    PlatformSupportTicketController(SupportTicketService service) { this.service = service; }
    @GetMapping ApiResponse<Page> list(@RequestParam(required = false) UUID tenantId, @RequestParam(required = false) String status,
            @RequestParam(required = false) String priority, @RequestParam(required = false) String query,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "25") int size) {
        return ApiResponse.ok(service.list(tenantId, status, priority, query, page, size));
    }
    @GetMapping("/agents") ApiResponse<List<Agent>> agents() { return ApiResponse.ok(service.agents()); }
    @GetMapping("/{id}") ApiResponse<Detail> detail(@PathVariable UUID id) { return ApiResponse.ok(service.detail(null, id, true)); }
    @PatchMapping("/{id}") ApiResponse<Detail> update(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id, @Valid @RequestBody Update request) {
        return ApiResponse.ok(service.update(principal.userId(), id, request));
    }
    @PostMapping("/{id}/messages") ApiResponse<Detail> reply(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID id, @Valid @RequestBody AdminReply request) {
        return ApiResponse.ok(service.reply(null, principal.userId(), id, request.body(), true, request.internal()));
    }
}
