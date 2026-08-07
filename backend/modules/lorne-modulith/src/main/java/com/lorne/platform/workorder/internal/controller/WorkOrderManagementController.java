package com.lorne.platform.workorder.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.WorkerAvailabilityDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewActionRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewDto;
import com.lorne.platform.workorder.internal.service.WorkOrderManagementService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/work-orders")
class WorkOrderManagementController {
    private final WorkOrderManagementService workOrderManagementService;

    WorkOrderManagementController(WorkOrderManagementService workOrderManagementService) {
        this.workOrderManagementService = workOrderManagementService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<WorkOrderDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(workOrderManagementService.list(principal.tenantId()));
    }

    @GetMapping("/availability")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<List<WorkerAvailabilityDto>> availability(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) UUID workOrderId,
            @RequestParam(required = false) UUID serviceTypeId,
            @RequestParam(required = false) Instant scheduledStart,
            @RequestParam(required = false) Instant scheduledEnd
    ) {
        return ApiResponse.ok(workOrderManagementService.availability(
                principal.tenantId(),
                workOrderId,
                serviceTypeId,
                scheduledStart,
                scheduledEnd
        ));
    }

    @GetMapping("/{workOrderId}/review")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<WorkOrderReviewDto> review(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId
    ) {
        return ApiResponse.ok(workOrderManagementService.review(principal.tenantId(), principal.userId(), workOrderId));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateWorkOrderRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{workOrderId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody CreateWorkOrderRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.update(principal.tenantId(), principal.userId(), workOrderId, request));
    }

    @PostMapping("/{workOrderId}/review/actions")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderReviewDto> reviewAction(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @RequestBody WorkOrderReviewActionRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.reviewAction(principal.tenantId(), principal.userId(), workOrderId, request));
    }

    @PostMapping("/{workOrderId}/invoice")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<WorkOrderReviewDto> generateInvoice(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId
    ) {
        return ApiResponse.ok(workOrderManagementService.generateInvoice(principal.tenantId(), principal.userId(), workOrderId));
    }
}
