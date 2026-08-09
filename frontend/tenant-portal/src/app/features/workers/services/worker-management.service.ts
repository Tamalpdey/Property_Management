import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateWorkerRequest, UpdateWorkerStatusRequest, WorkerRecord } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkerManagementService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<WorkerRecord[]>>(`${environment.apiBaseUrl}/tenant/workers`)
      .pipe(map((response) => response.data));
  }

  create(request: CreateWorkerRequest) {
    return this.http
      .post<ApiResponse<WorkerRecord>>(`${environment.apiBaseUrl}/tenant/workers`, request)
      .pipe(map((response) => response.data));
  }

  update(workerId: string, request: CreateWorkerRequest) {
    return this.http
      .patch<ApiResponse<WorkerRecord>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}`, request)
      .pipe(map((response) => response.data));
  }

  updateStatus(workerId: string, request: UpdateWorkerStatusRequest) {
    return this.http
      .patch<ApiResponse<WorkerRecord>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}/status`, request)
      .pipe(map((response) => response.data));
  }

  delete(workerId: string) {
    return this.http
      .delete<ApiResponse<void>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}`)
      .pipe(map((response) => response.data));
  }
}
