import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  CreateTenantOnboardingRequest,
  SuperAdminTenantSummary,
  TenantOnboardingResult
} from '@lorne/contracts';
import type { SuperAdminTenantDetail, UpdateTenantRequest, TenantAdministrationEvent } from '@lorne/contracts';
import type { PlatformAuditPage, TenantHealthReport, TenantSupportNote, TenantUserRecord, UpdateTenantPortalAccessRequest } from '@lorne/contracts';
import type { TenantOperationsOverview } from '@lorne/contracts';
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

  detail(tenantId: string) {
    return this.http.get<ApiResponse<SuperAdminTenantDetail>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}`)
      .pipe(map(response => response.data));
  }

  update(tenantId: string, request: UpdateTenantRequest) {
    return this.http.patch<ApiResponse<SuperAdminTenantDetail>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}`, request)
      .pipe(map(response => response.data));
  }

  history(tenantId: string) {
    return this.http.get<ApiResponse<TenantAdministrationEvent[]>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/history`)
      .pipe(map(response => response.data));
  }

  updateModule(tenantId: string, moduleCode: 'QUOTES', enabled: boolean) {
    return this.http
      .patch<ApiResponse<SuperAdminTenantSummary>>(
        `${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/modules/${moduleCode}`,
        { enabled }
      )
      .pipe(map((response) => response.data));
  }

  users(tenantId: string) {
    return this.http.get<ApiResponse<TenantUserRecord[]>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/users`).pipe(map(response => response.data));
  }

  setAccess(tenantId: string, active: boolean, reason: string) {
    return this.http.patch<ApiResponse<SuperAdminTenantSummary>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/access`, { active, reason }).pipe(map(response => response.data));
  }

  operations(tenantId: string) {
    return this.http.get<ApiResponse<TenantOperationsOverview>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/operations`).pipe(map(response => response.data));
  }

  updatePortalAccess(tenantId: string, userId: string, request: UpdateTenantPortalAccessRequest) {
    return this.http.patch<ApiResponse<TenantUserRecord>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/users/${userId}/portal-access`, request).pipe(map(response => response.data));
  }

  health(tenantId: string) {
    return this.http.get<ApiResponse<TenantHealthReport>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/health`).pipe(map(response => response.data));
  }

  notes(tenantId: string) {
    return this.http.get<ApiResponse<TenantSupportNote[]>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/support-notes`).pipe(map(response => response.data));
  }

  addNote(tenantId: string, note: string) {
    return this.http.post<ApiResponse<TenantSupportNote[]>>(`${environment.apiBaseUrl}/superadmin/tenants/${tenantId}/support-notes`, { note }).pipe(map(response => response.data));
  }

  audit(filters: { tenantId?: string; query?: string; from?: string; until?: string; page?: number; size?: number }) {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<ApiResponse<PlatformAuditPage>>(`${environment.apiBaseUrl}/superadmin/audit`, { params }).pipe(map(response => response.data));
  }
}
