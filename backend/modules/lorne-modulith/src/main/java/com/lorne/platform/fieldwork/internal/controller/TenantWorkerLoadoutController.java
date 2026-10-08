package com.lorne.platform.fieldwork.internal.controller;

import com.lorne.platform.fieldwork.internal.dto.WorkerDailyLoadoutDto;
import com.lorne.platform.fieldwork.internal.service.WorkerDailyLoadoutService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/workers")
class TenantWorkerLoadoutController {
    private final WorkerDailyLoadoutService workerDailyLoadoutService;

    TenantWorkerLoadoutController(WorkerDailyLoadoutService workerDailyLoadoutService) {
        this.workerDailyLoadoutService = workerDailyLoadoutService;
    }

    @GetMapping("/{workerId}/loadouts")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<WorkerDailyLoadoutDto>> loadouts(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workerId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.loadouts(principal.tenantId(), workerId, from, to));
    }
}
