package com.lorne.platform.fieldwork.internal.controller;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.document.PhotoUploadRequest;
import com.lorne.platform.document.PresignedPhotoUpload;
import com.lorne.platform.fieldwork.internal.dto.WorkerActivityRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerAssignedJobDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerDailyLoadoutDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerJobActionResponse;
import com.lorne.platform.fieldwork.internal.dto.WorkerLoadoutToolActionRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockDto;
import com.lorne.platform.fieldwork.internal.dto.WorkerShiftClockRequest;
import com.lorne.platform.fieldwork.internal.dto.WorkerTodayResponse;
import com.lorne.platform.fieldwork.internal.service.WorkerDailyLoadoutService;
import com.lorne.platform.fieldwork.internal.service.WorkerJobService;
import com.lorne.platform.fieldwork.internal.service.WorkerShiftClockService;
import com.lorne.platform.fieldwork.internal.service.WorkerTodayService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.tenant.TenantPublicSettingsDto;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.workorder.internal.dto.UpsertWorkOrderMaintenanceRecordRequest;
import com.lorne.platform.workorder.internal.dto.WorkOrderMaintenanceRecordDto;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/field-worker")
class WorkerTodayController {
    private final WorkerTodayService workerTodayService;
    private final WorkerJobService workerJobService;
    private final WorkerDailyLoadoutService workerDailyLoadoutService;
    private final WorkerShiftClockService workerShiftClockService;
    private final DocumentStorageService documentStorageService;
    private final TenantSettingsOperations tenantSettingsOperations;

    WorkerTodayController(
            WorkerTodayService workerTodayService,
            WorkerJobService workerJobService,
            WorkerDailyLoadoutService workerDailyLoadoutService,
            WorkerShiftClockService workerShiftClockService,
            DocumentStorageService documentStorageService,
            TenantSettingsOperations tenantSettingsOperations
    ) {
        this.workerTodayService = workerTodayService;
        this.workerJobService = workerJobService;
        this.workerDailyLoadoutService = workerDailyLoadoutService;
        this.workerShiftClockService = workerShiftClockService;
        this.documentStorageService = documentStorageService;
        this.tenantSettingsOperations = tenantSettingsOperations;
    }

    @GetMapping("/today")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerTodayResponse> today() {
        return ApiResponse.ok(workerTodayService.today());
    }

    @GetMapping("/settings")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<TenantPublicSettingsDto> settings(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(TenantPublicSettingsDto.from(tenantSettingsOperations.settings(principal.tenantId())));
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

    @GetMapping("/loadout")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> loadout(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.loadout(principal.tenantId(), principal.userId(), principal.email(), date));
    }

    @PostMapping("/loadout/tools/check-out")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> checkOutLoadoutTool(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date,
            @Valid @RequestBody WorkerLoadoutToolActionRequest request
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.checkOutTool(principal.tenantId(), principal.userId(), principal.email(), date, request));
    }

    @PostMapping("/loadout/tools/return")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> returnLoadoutTool(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date,
            @Valid @RequestBody WorkerLoadoutToolActionRequest request
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.returnTool(principal.tenantId(), principal.userId(), principal.email(), date, request));
    }

    @PostMapping("/loadout/tools/report-issue")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> reportLoadoutToolIssue(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date,
            @Valid @RequestBody WorkerLoadoutToolActionRequest request
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.reportToolIssue(principal.tenantId(), principal.userId(), principal.email(), date, request));
    }

    @PostMapping("/loadout/activities/start")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> startActivity(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date,
            @Valid @RequestBody WorkerActivityRequest request
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.startActivity(principal.tenantId(), principal.userId(), principal.email(), date, request));
    }

    @PostMapping("/loadout/activities/{activityId}/end")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerDailyLoadoutDto> endActivity(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) LocalDate date,
            @PathVariable UUID activityId,
            @RequestBody(required = false) WorkerActivityRequest request
    ) {
        return ApiResponse.ok(workerDailyLoadoutService.endActivity(principal.tenantId(), principal.userId(), principal.email(), date, activityId, request));
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

    @PostMapping("/clock/pause")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerShiftClockDto> pauseClock(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody(required = false) WorkerShiftClockRequest request
    ) {
        return ApiResponse.ok(workerShiftClockService.pause(principal.tenantId(), principal.userId(), principal.email(), request));
    }

    @PostMapping("/clock/resume")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerShiftClockDto> resumeClock(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody(required = false) WorkerShiftClockRequest request
    ) {
        return ApiResponse.ok(workerShiftClockService.resume(principal.tenantId(), principal.userId(), principal.email(), request));
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

    @GetMapping("/jobs/{workOrderId}/maintenance-record")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkOrderMaintenanceRecordDto> maintenanceRecord(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId
    ) {
        return ApiResponse.ok(workerJobService.maintenanceRecord(principal.tenantId(), principal.userId(), principal.email(), workOrderId));
    }

    @PutMapping("/jobs/{workOrderId}/maintenance-record")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkOrderMaintenanceRecordDto> saveMaintenanceRecord(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @RequestBody UpsertWorkOrderMaintenanceRecordRequest request
    ) {
        return ApiResponse.ok(workerJobService.saveMaintenanceRecord(principal.tenantId(), principal.userId(), principal.email(), workOrderId, request));
    }

    @PostMapping("/jobs/{workOrderId}/photos/upload-url")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<PresignedPhotoUpload> photoUploadUrl(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @Valid @RequestBody PhotoUploadRequest request
    ) {
        workerShiftClockService.requireClockedIn(principal.tenantId(), principal.userId(), principal.email());
        workerJobService.requireEvidenceUploadAllowed(principal.tenantId(), principal.userId(), principal.email(), workOrderId);
        workerJobService.requireEvidenceLimitAvailable(principal.tenantId(), workOrderId, request.documentType(), request.photoType());
        return ApiResponse.ok(documentStorageService.createWorkOrderPhotoUpload(principal.tenantId(), principal.userId(), workOrderId, request));
    }

    @DeleteMapping("/jobs/{workOrderId}/documents/{documentId}")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<WorkerJobActionResponse> deleteEvidence(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID workOrderId,
            @PathVariable UUID documentId
    ) {
        return ApiResponse.ok(workerJobService.deleteEvidence(principal.tenantId(), principal.userId(), principal.email(), workOrderId, documentId));
    }
}
