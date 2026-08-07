import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateTenantUserRequest, TenantRoleOption, TenantUserRecord } from '@lorne/contracts';
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
}
