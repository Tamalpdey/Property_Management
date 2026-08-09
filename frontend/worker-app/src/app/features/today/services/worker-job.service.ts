import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, PhotoUploadRequest, PresignedPhotoUpload, WorkerAssignedJob, WorkerJobActionRequest, WorkerJobActionResponse } from '@lorne/contracts';
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

  action(workOrderId: string, request: WorkerJobActionRequest) {
    return this.http
      .post<ApiResponse<WorkerJobActionResponse>>(`${environment.apiBaseUrl}/field-worker/jobs/${workOrderId}/actions`, request)
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
