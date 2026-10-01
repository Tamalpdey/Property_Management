import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  CreateWorkerRequest,
  UpdateWorkerStatusRequest,
  WorkerActivityOverrideRequest,
  WorkerActivityRecord,
  WorkerClockEntryOverrideRequest,
  WorkerClockEntryRecord,
  WorkerClockedInTodayRecord,
  WorkerRecord
} from '@lorne/contracts';
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

  clockEntries(workerId: string, from: string, to: string) {
    return this.http
      .get<ApiResponse<WorkerClockEntryRecord[]>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}/clock-entries`, {
        params: { from, to }
      })
      .pipe(map((response) => response.data));
  }

  clockedInToday() {
    return this.http
      .get<ApiResponse<WorkerClockedInTodayRecord[]>>(`${environment.apiBaseUrl}/tenant/workers/clocked-in-today`)
      .pipe(map((response) => response.data));
  }

  overrideClockEntry(workerId: string, entryId: string, request: WorkerClockEntryOverrideRequest) {
    return this.http
      .post<ApiResponse<WorkerClockEntryRecord[]>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}/clock-entries/${entryId}/override`, request)
      .pipe(map((response) => response.data));
  }

  activities(workerId: string, from: string, to: string) {
    return this.http
      .get<ApiResponse<WorkerActivityRecord[]>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}/activities`, {
        params: { from, to }
      })
      .pipe(map((response) => response.data));
  }

  overrideActivity(workerId: string, request: WorkerActivityOverrideRequest) {
    return this.http
      .post<ApiResponse<WorkerActivityRecord[]>>(`${environment.apiBaseUrl}/tenant/workers/${workerId}/activities/override`, request)
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
