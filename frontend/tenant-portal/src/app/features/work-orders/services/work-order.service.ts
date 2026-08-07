import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateWorkOrderRequest, WorkerAvailabilityOption, WorkOrderRecord, WorkOrderReview, WorkOrderReviewActionRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkOrderService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<WorkOrderRecord[]>>(`${environment.apiBaseUrl}/tenant/work-orders`)
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

  generateInvoice(workOrderId: string) {
    return this.http
      .post<ApiResponse<WorkOrderReview>>(`${environment.apiBaseUrl}/tenant/work-orders/${workOrderId}/invoice`, {})
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
