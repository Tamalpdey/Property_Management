import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateWorkerRequest, WorkerRecord } from '@lorne/contracts';
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

}
