import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  CreateTenantOnboardingRequest,
  SuperAdminTenantSummary,
  TenantOnboardingResult
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SuperAdminTenantService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<SuperAdminTenantSummary[]>>(`${environment.apiBaseUrl}/superadmin/tenants`)
      .pipe(map((response) => response.data));
  }

  create(request: CreateTenantOnboardingRequest) {
    return this.http
      .post<ApiResponse<TenantOnboardingResult>>(`${environment.apiBaseUrl}/superadmin/tenants`, request)
      .pipe(map((response) => response.data));
  }
}
