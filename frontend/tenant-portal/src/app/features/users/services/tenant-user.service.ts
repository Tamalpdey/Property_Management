import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, CreateTenantUserRequest, TenantRoleOption, TenantUserRecord, UpdateTenantUserRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantUserService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<TenantUserRecord[]>>(`${environment.apiBaseUrl}/tenant/users`)
      .pipe(map((response) => response.data));
  }

  roles() {
    return this.http
      .get<ApiResponse<TenantRoleOption[]>>(`${environment.apiBaseUrl}/tenant/users/roles`)
      .pipe(map((response) => response.data));
  }

  create(request: CreateTenantUserRequest) {
    return this.http
      .post<ApiResponse<TenantUserRecord>>(`${environment.apiBaseUrl}/tenant/users`, request)
      .pipe(map((response) => response.data));
  }

  update(userId: string, request: UpdateTenantUserRequest) {
    return this.http
      .patch<ApiResponse<TenantUserRecord>>(`${environment.apiBaseUrl}/tenant/users/${userId}`, request)
      .pipe(map((response) => response.data));
  }

  activate(userId: string) {
    return this.http
      .post<ApiResponse<TenantUserRecord>>(`${environment.apiBaseUrl}/tenant/users/${userId}/activate`, {})
      .pipe(map((response) => response.data));
  }

  deactivate(userId: string) {
    return this.http
      .post<ApiResponse<TenantUserRecord>>(`${environment.apiBaseUrl}/tenant/users/${userId}/deactivate`, {})
      .pipe(map((response) => response.data));
  }

  delete(userId: string) {
    return this.http
      .delete<ApiResponse<void>>(`${environment.apiBaseUrl}/tenant/users/${userId}`)
      .pipe(map((response) => response.data));
  }
}
