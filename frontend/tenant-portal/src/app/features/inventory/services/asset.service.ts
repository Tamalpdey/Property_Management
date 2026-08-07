import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiResponse, AssetCatalog, CreateAssetRequest, TenantAsset } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private readonly http = inject(HttpClient);

  catalog() {
    return this.http
      .get<ApiResponse<AssetCatalog>>(`${environment.apiBaseUrl}/tenant/assets`)
      .pipe(map((response) => response.data));
  }

  create(request: CreateAssetRequest) {
    return this.http
      .post<ApiResponse<TenantAsset>>(`${environment.apiBaseUrl}/tenant/assets`, request)
      .pipe(map((response) => response.data));
  }
}
