import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, CreatePropertyOwnerRequest, PropertyOwner } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PropertyOwnerService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<PropertyOwner[]>>(`${environment.apiBaseUrl}/tenant/property-owners`)
      .pipe(map((response) => response.data));
  }

  create(request: CreatePropertyOwnerRequest) {
    return this.http
      .post<ApiResponse<PropertyOwner>>(`${environment.apiBaseUrl}/tenant/property-owners`, request)
      .pipe(map((response) => response.data));
  }

  update(ownerId: string, request: CreatePropertyOwnerRequest) {
    return this.http
      .patch<ApiResponse<PropertyOwner>>(`${environment.apiBaseUrl}/tenant/property-owners/${ownerId}`, request)
      .pipe(map((response) => response.data));
  }

  updateStatus(ownerId: string, active: boolean) {
    return this.http
      .patch<ApiResponse<PropertyOwner>>(`${environment.apiBaseUrl}/tenant/property-owners/${ownerId}/status`, { active })
      .pipe(map((response) => response.data));
  }

  delete(ownerId: string) {
    return this.http
      .delete<ApiResponse<void>>(`${environment.apiBaseUrl}/tenant/property-owners/${ownerId}`)
      .pipe(map((response) => response.data));
  }
}
