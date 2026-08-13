import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, CreateServiceCategoryRequest, CreateServiceTypeRequest, ServiceCatalog, ServiceCategory, ServiceType, UpdateServiceTypeStatusRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ServiceCatalogService {
  private readonly http = inject(HttpClient);

  catalog() {
    return this.http
      .get<ApiResponse<ServiceCatalog>>(`${environment.apiBaseUrl}/tenant/service-catalog`)
      .pipe(map((response) => response.data));
  }

  createCategory(request: CreateServiceCategoryRequest) {
    return this.http
      .post<ApiResponse<ServiceCategory>>(`${environment.apiBaseUrl}/tenant/service-catalog/categories`, request)
      .pipe(map((response) => response.data));
  }

  createServiceType(request: CreateServiceTypeRequest) {
    return this.http
      .post<ApiResponse<ServiceType>>(`${environment.apiBaseUrl}/tenant/service-catalog/types`, request)
      .pipe(map((response) => response.data));
  }

  updateServiceType(serviceTypeId: string, request: CreateServiceTypeRequest) {
    return this.http
      .patch<ApiResponse<ServiceType>>(`${environment.apiBaseUrl}/tenant/service-catalog/types/${serviceTypeId}`, request)
      .pipe(map((response) => response.data));
  }

  updateServiceTypeStatus(serviceTypeId: string, request: UpdateServiceTypeStatusRequest) {
    return this.http
      .patch<ApiResponse<ServiceType>>(`${environment.apiBaseUrl}/tenant/service-catalog/types/${serviceTypeId}/status`, request)
      .pipe(map((response) => response.data));
  }

  deleteServiceType(serviceTypeId: string) {
    return this.http
      .delete<ApiResponse<void>>(`${environment.apiBaseUrl}/tenant/service-catalog/types/${serviceTypeId}`)
      .pipe(map((response) => response.data));
  }
}
