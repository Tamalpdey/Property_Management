import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  CancelWorkOrderRequest,
  CreateWorkOrderRequest,
  PhotoUploadRequest,
  PresignedPhotoUpload,
  SendWorkOrderOwnerEmailRequest,
  WorkerAvailabilityOption,
  WorkOrderEvidenceActionRequest,
  WorkOrderFieldOverrideRequest,
  WorkOrderRecord,
  WorkOrderReview,
  WorkOrderReviewActionRequest
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface WorkOrderListFilters {
  statusFilter?: string;
  dateFilter?: string;
  customFrom?: string;
  customTo?: string;
}

@Injectable({ providedIn: 'root' })
export class WorkOrderService {
  private readonly http = inject(HttpClient);

  list(filters: WorkOrderListFilters = {}) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => Boolean(value))
    ) as Record<string, string>;
    return this.http
      .get<ApiResponse<WorkOrderRecord[]>>(`${environment.apiBaseUrl}/tenant/work-orders`, { params })
      .pipe(map((response) => response.data));
  }

  create(request: CreateWorkOrderRequest) {
    return this.http
      .post<ApiResponse<WorkOrderRecord>>(`${environment.apiBaseUrl}/tenant/work-orders`, request)
      .pipe(map((response) => response.data));
  }

  update(workOrderId: string, request: CreateWorkOrderRequest) {
    return this.http
      .patch<ApiResponse<WorkOrderRecord>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}`, request)
      .pipe(map((response) => response.data));
  }

  cancel(workOrderId: string, request: CancelWorkOrderRequest) {
    return this.http
      .post<ApiResponse<WorkOrderRecord>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/cancel`, request)
      .pipe(map((response) => response.data));
  }

  review(workOrderId: string) {
    return this.http
      .get<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/review`)
      .pipe(map((response) => response.data));
  }

  reviewAction(workOrderId: string, request: WorkOrderReviewActionRequest) {
    return this.http
      .post<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/review/actions`, request)
      .pipe(map((response) => response.data));
  }

  fieldOverride(workOrderId: string, request: WorkOrderFieldOverrideRequest) {
    return this.http
      .patch<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/field-override`, request)
      .pipe(map((response) => response.data));
  }

  evidenceUploadUrl(workOrderId: string, request: PhotoUploadRequest) {
    return this.http
      .post<ApiResponse<PresignedPhotoUpload>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/evidence/upload-url`, request)
      .pipe(map((response) => response.data));
  }

  uploadEvidence(upload: PresignedPhotoUpload, file: File) {
    return this.http.put(upload.uploadUrl, file, {
      headers: upload.headers,
      responseType: 'text'
    });
  }

  evidenceAction(workOrderId: string, request: WorkOrderEvidenceActionRequest) {
    return this.http
      .post<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/evidence/actions`, request)
      .pipe(map((response) => response.data));
  }

  generateInvoice(workOrderId: string) {
    return this.http
      .post<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/invoice`, {})
      .pipe(map((response) => response.data));
  }

  notifyOwner(workOrderId: string, request: SendWorkOrderOwnerEmailRequest = {}) {
    return this.http
      .post<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/owner-notification`, request)
      .pipe(map((response) => response.data));
  }

  availability(request: {
    workOrderId?: string;
    serviceTypeId?: string;
    scheduledStart?: string;
    scheduledEnd?: string;
  }) {
    const params = Object.fromEntries(Object.entries(request).filter(([, value]) => Boolean(value))) as Record<string, string>;
    return this.http
      .get<ApiResponse<WorkerAvailabilityOption[]>>(`${environment.apiBaseUrl}/tenant/work-orders/availability`, { params })
      .pipe(map((response) => response.data));
  }
}
