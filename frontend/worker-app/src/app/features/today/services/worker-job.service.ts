import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  PhotoUploadRequest,
  PresignedPhotoUpload,
  WorkerAssignedJob,
  WorkerActivityRequest,
  WorkerDailyLoadout,
  WorkerClockEntryRecord,
  WorkerJobActionRequest,
  WorkerJobActionResponse,
  WorkerLoadoutToolActionRequest,
  TenantSettingsRecord,
  UpsertWorkOrderMaintenanceRecordRequest,
  WorkOrderMaintenanceRecord
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkerJobService {
  private readonly http = inject(HttpClient);

  jobs(from: string, to: string) {
    return this.http
      .get<ApiResponse<WorkerAssignedJob[]>>(`${environment.apiBaseUrl}/field-worker/jobs`, { params: { from, to } })
      .pipe(map((response) => response.data));
  }

  loadout(date: string) {
    return this.http
      .get<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout`, { params: { date } })
      .pipe(map((response) => response.data));
  }

  settings() {
    return this.http
      .get<ApiResponse<TenantSettingsRecord>>(`${environment.apiBaseUrl}/field-worker/settings`)
      .pipe(map((response) => response.data));
  }

  clockEntries(from: string, to: string) {
    return this.http
      .get<ApiResponse<WorkerClockEntryRecord[]>>(`${environment.apiBaseUrl}/field-worker/clock-entries`, { params: { from, to } })
      .pipe(map((response) => response.data));
  }

  checkOutLoadoutTool(date: string, request: WorkerLoadoutToolActionRequest) {
    return this.http
      .post<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout/tools/check-out`, request, { params: { date } })
      .pipe(map((response) => response.data));
  }

  returnLoadoutTool(date: string, request: WorkerLoadoutToolActionRequest) {
    return this.http
      .post<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout/tools/return`, request, { params: { date } })
      .pipe(map((response) => response.data));
  }

  reportLoadoutToolIssue(date: string, request: WorkerLoadoutToolActionRequest) {
    return this.http
      .post<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout/tools/report-issue`, request, { params: { date } })
      .pipe(map((response) => response.data));
  }

  startActivity(date: string, request: WorkerActivityRequest) {
    return this.http
      .post<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout/activities/start`, request, { params: { date } })
      .pipe(map((response) => response.data));
  }

  endActivity(date: string, activityId: string, request: WorkerActivityRequest = {}) {
    return this.http
      .post<ApiResponse<WorkerDailyLoadout>>(`${environment.apiBaseUrl}/field-worker/loadout/activities/${activityId}/end`, request, { params: { date } })
      .pipe(map((response) => response.data));
  }

  action(workOrderId: string, request: WorkerJobActionRequest) {
    return this.http
      .post<ApiResponse<WorkerJobActionResponse>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/actions`, request)
      .pipe(map((response) => response.data));
  }

  maintenanceRecord(workOrderId: string) {
    return this.http
      .get<ApiResponse<WorkOrderMaintenanceRecord | null>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/maintenance-record`)
      .pipe(map((response) => response.data));
  }

  saveMaintenanceRecord(workOrderId: string, request: UpsertWorkOrderMaintenanceRecordRequest) {
    return this.http
      .put<ApiResponse<WorkOrderMaintenanceRecord>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/maintenance-record`, request)
      .pipe(map((response) => response.data));
  }

  photoUploadUrl(workOrderId: string, request: PhotoUploadRequest) {
    return this.http
      .post<ApiResponse<PresignedPhotoUpload>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/photos/upload-url`, request)
      .pipe(map((response) => response.data));
  }

  uploadPhoto(upload: PresignedPhotoUpload, file: File) {
    return this.http.put(upload.uploadUrl, file, {
      headers: upload.headers,
      responseType: 'text'
    });
  }

  deleteEvidence(workOrderId: string, documentId: string) {
    return this.http
      .delete<ApiResponse<WorkerJobActionResponse>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/documents/${documentId}`)
      .pipe(map((response) => response.data));
  }
}
