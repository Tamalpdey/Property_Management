package com.lorne.platform.quote.internal.controller;

import com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.*;
import com.lorne.platform.quote.internal.service.QuoteTemplateService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
class QuoteTemplateController {
    private final QuoteTemplateService service;
    QuoteTemplateController(QuoteTemplateService service) { this.service = service; }
    @GetMapping("/api/v1/tenant/quotes/templates")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<Template>> available(@AuthenticationPrincipal JwtPrincipal principal) { return ApiResponse.ok(service.available(principal.tenantId())); }
    @GetMapping("/api/v1/superadmin/quote-templates") @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<List<Template>> catalog() { return ApiResponse.ok(service.catalog()); }
    @PatchMapping("/api/v1/superadmin/quote-templates/{code}") @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<Template> configure(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable String code, @Valid @RequestBody Configure request) { return ApiResponse.ok(service.configure(principal.userId(), code, request)); }
    @GetMapping("/api/v1/superadmin/tenants/{tenantId}/quote-templates") @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<Assignment> assignment(@PathVariable UUID tenantId) { return ApiResponse.ok(service.assignment(tenantId)); }
    @PatchMapping("/api/v1/superadmin/tenants/{tenantId}/quote-templates") @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<Assignment> assign(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID tenantId, @Valid @RequestBody Assign request) { return ApiResponse.ok(service.assign(tenantId, principal.userId(), request)); }
}
