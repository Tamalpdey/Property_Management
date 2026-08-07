package com.lorne.platform.worker.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.worker.internal.dto.CreateWorkerRequest;
import com.lorne.platform.worker.internal.dto.WorkerDto;
import com.lorne.platform.worker.internal.service.WorkerManagementService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/workers")
class WorkerManagementController {
    private final WorkerManagementService workerManagementService;

    WorkerManagementController(WorkerManagementService workerManagementService) {
        this.workerManagementService = workerManagementService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<WorkerDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(workerManagementService.list(principal.tenantId()));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkerDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateWorkerRequest request
    ) {
        return ApiResponse.ok(workerManagementService.create(principal.tenantId(), principal.userId(), request));
    }
}
