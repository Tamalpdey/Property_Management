package com.lorne.platform.workorder.internal.controller;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.document.PhotoUploadRequest;
import com.lorne.platform.document.PresignedPhotoUpload;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.workorder.internal.dto.CancelWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.CreateWorkOrderRequest;
import com.lorne.platform.workorder.internal.dto.RefreshWorkOrderTravelEstimatesRequest;
import com.lorne.platform.workorder.internal.dto.SendWorkOrderOwnerEmailRequest;
import com.lorne.platform.workorder.internal.dto.WorkerAvailabilityDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderDto;
import com.lorne.platform.workorder.internal.dto.WorkOrderEvidenceActionRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderFieldOverrideRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewActionRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderReviewDto;
import com.lorne.platform.workorder.internal.service.WorkOrderManagementService;
import jakarta.validation.Valid;
import java.time.Instant;
import java.time.LocalDate;
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
    private final DocumentStorageService documentStorageService;

    WorkOrderManagementController(
            WorkOrderManagementService workOrderManagementService,
            DocumentStorageService documentStorageService
    ) {
        this.workOrderManagementService = workOrderManagementService;
        this.documentStorageService = documentStorageService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<WorkOrderDto>> list(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(defaultValue = "ALL") String statusFilter,
            @RequestParam(defaultValue = "ALL") String dateFilter,
            @RequestParam(required = false) LocalDate customFrom,
            @RequestParam(required = false) LocalDate customTo
    ) {
        return ApiResponse.ok(workOrderManagementService.list(principal.tenantId(), statusFilter, dateFilter, customFrom, customTo));
    }

    @PostMapping("/travel-estimates/refresh")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<List<WorkOrderDto>> refreshTravelEstimates(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody RefreshWorkOrderTravelEstimatesRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.refreshTravelEstimates(principal.tenantId(), principal.userId(), request));
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

    @PostMapping("/{workOrderId}/cancel")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderDto> cancel(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody CancelWorkOrderRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.cancel(principal.tenantId(), principal.userId(), workOrderId, request));
    }

    @PostMapping("/{workOrderId}/review/actions")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderReviewDto> reviewAction(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @RequestBody WorkOrderReviewActionRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.reviewAction(
                principal.tenantId(),
                principal.userId(),
                principal.roles(),
                workOrderId,
                request
        ));
    }

    @PatchMapping("/{workOrderId}/field-override")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderReviewDto> fieldOverride(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody WorkOrderFieldOverrideRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.fieldOverride(
                principal.tenantId(),
                principal.userId(),
                workOrderId,
                request
        ));
    }

    @PostMapping("/{workOrderId}/evidence/upload-url")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<PresignedPhotoUpload> evidenceUploadUrl(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @RequestBody PhotoUploadRequest request
    ) {
        workOrderManagementService.requireWorkOrderExists(principal.tenantId(), workOrderId);
        return ApiResponse.ok(documentStorageService.createWorkOrderPhotoUpload(
                principal.tenantId(),
                principal.userId(),
                workOrderId,
                request
        ));
    }

    @PostMapping("/{workOrderId}/evidence/actions")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderReviewDto> evidenceAction(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody WorkOrderEvidenceActionRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.evidenceAction(principal.tenantId(), principal.userId(), workOrderId, request));
    }

    @PostMapping("/{workOrderId}/invoice")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<WorkOrderReviewDto> generateInvoice(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId
    ) {
        return ApiResponse.ok(workOrderManagementService.generateInvoice(principal.tenantId(), principal.userId(), workOrderId));
    }

    @PostMapping("/{workOrderId}/owner-notification")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<WorkOrderReviewDto> notifyOwner(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @RequestBody(required = false) SendWorkOrderOwnerEmailRequest request
    ) {
        return ApiResponse.ok(workOrderManagementService.notifyOwner(principal.tenantId(), principal.userId(), workOrderId, request));
    }
}
