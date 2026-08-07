package com.lorne.platform.workorder.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.workorder.internal.dto.CreateRecurringWorkTemplateRequest;
import com.lorne.platform.workorder.internal.dto.RecurringWorkGenerationResult;
import com.lorne.platform.workorder.internal.dto.RecurringWorkTemplateDto;
import com.lorne.platform.workorder.internal.service.RecurringWorkTemplateService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/recurring-work")
class RecurringWorkTemplateController {
    private final RecurringWorkTemplateService recurringWorkTemplateService;

    RecurringWorkTemplateController(RecurringWorkTemplateService recurringWorkTemplateService) {
        this.recurringWorkTemplateService = recurringWorkTemplateService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<List<RecurringWorkTemplateDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(recurringWorkTemplateService.list(principal.tenantId()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<RecurringWorkTemplateDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateRecurringWorkTemplateRequest request
    ) {
        return ApiResponse.ok(recurringWorkTemplateService.create(principal.tenantId(), principal.userId(), request));
    }

    @PostMapping("/generate-drafts")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<RecurringWorkGenerationResult> generateDrafts(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate through
    ) {
        return ApiResponse.ok(recurringWorkTemplateService.generateDrafts(principal.tenantId(), principal.userId(), through));
    }
}
