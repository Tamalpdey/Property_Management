import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreatePropertyRequest, PropertyRecord, UpdatePropertyServicesRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PropertyService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<PropertyRecord[]>>(`${environment.apiBaseUrl}/tenant/properties`)
      .pipe(map((response) => response.data));
  }

  create(request: CreatePropertyRequest) {
    return this.http
      .post<ApiResponse<PropertyRecord>>(`${environment.apiBaseUrl}/tenant/properties`, request)
      .pipe(map((response) => response.data));
  }

  updateServices(propertyId: string, request: UpdatePropertyServicesRequest) {
    return this.http
      .put<ApiResponse<PropertyRecord>>(`${environment.apiBaseUrl}/tenant/properties/${propertyId}/services`, request)
      .pipe(map((response) => response.data));
  }
}
