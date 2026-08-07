import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, CreateServiceCategoryRequest, CreateServiceTypeRequest, ServiceCatalog, ServiceCategory, ServiceType } from '@lorne/contracts';
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
}
