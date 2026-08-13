import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, SuperAdminOverviewResponse } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SuperAdminOverviewService {
  private readonly http = inject(HttpClient);

  overview() {
    return this.http
      .get<ApiResponse<SuperAdminOverviewResponse>>(`${environment.apiBaseUrl}/superadmin/overview`)
      .pipe(map((response) => response.data));
  }
}
