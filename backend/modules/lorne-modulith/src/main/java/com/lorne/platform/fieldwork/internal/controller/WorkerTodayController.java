package com.lorne.platform.fieldwork.internal.controller;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.document.PhotoUploadRequest;
import com.lorne.platform.document.PresignedPhotoUpload;
import com.lorne.platform.fieldwork.internal.dto.WorkerAssignedJobDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionResponse;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerTodayResponse;
import com.lorne.platform.fieldwork.internal.service.WorkerJobService;
import com.lorne.platform.fieldwork.internal.service.WorkerShiftClockService;
import com.lorne.platform.fieldwork.internal.service.WorkerTodayService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.time.LocalDate;
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
@RequestMapping("/api/v1/field-worker")
class WorkerTodayController {
    private final WorkerTodayService workerTodayService;
    private final WorkerJobService workerJobService;
    private final WorkerShiftClockService workerShiftClockService;
    private final DocumentStorageService documentStorageService;

    WorkerTodayController(
            WorkerTodayService workerTodayService,
            WorkerJobService workerJobService,
            WorkerShiftClockService workerShiftClockService,
            DocumentStorageService documentStorageService
    ) {
        this.workerTodayService = workerTodayService;
        this.workerJobService = workerJobService;
        this.workerShiftClockService = workerShiftClockService;
        this.documentStorageService = documentStorageService;
    }

    @GetMapping("/today")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerTodayResponse> today() {
        return ApiResponse.ok(workerTodayService.today());
    }

    @GetMapping("/jobs")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<List<WorkerAssignedJobDto>> jobs(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to
    ) {
        return ApiResponse.ok(workerJobService.assignedJobs(principal.tenantId(), principal.userId(), principal.email(), from, to));
    }

    @GetMapping("/clock")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerShiftClockDto> clock(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(workerShiftClockService.state(principal.tenantId(), principal.userId(), principal.email()));
    }

    @PostMapping("/clock/in")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerShiftClockDto> clockIn(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody(required = false) WorkerShiftClockRequest request
    ) {
        return ApiResponse.ok(workerShiftClockService.clockIn(principal.tenantId(), principal.userId(), principal.email(), request));
    }

    @PostMapping("/clock/out")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerShiftClockDto> clockOut(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody(required = false) WorkerShiftClockRequest request
    ) {
        return ApiResponse.ok(workerShiftClockService.clockOut(principal.tenantId(), principal.userId(), principal.email(), request));
    }

    @PostMapping("/jobs/{workOrderId}/actions")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerJobActionResponse> action(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody WorkerJobActionRequest request
    ) {
        return ApiResponse.ok(workerJobService.applyAction(principal.tenantId(), principal.userId(), principal.email(), workOrderId, request));
    }

    @PostMapping("/jobs/{workOrderId}/photos/upload-url")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<PresignedPhotoUpload> photoUploadUrl(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody PhotoUploadRequest request
    ) {
        workerShiftClockService.requireClockedIn(principal.tenantId(), principal.userId(), principal.email());
        workerJobService.requireAssignedJob(principal.tenantId(), principal.userId(), principal.email(), workOrderId);
        return ApiResponse.ok(documentStorageService.createWorkOrderPhotoUpload(principal.tenantId(), principal.userId(), workOrderId, request));
    }
}
