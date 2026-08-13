import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, AssetCatalog, CreateAssetRequest, TenantAsset, UpdateAssetStatusRequest } from '@lorne/contracts';
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

  update(assetId: string, request: CreateAssetRequest) {
    return this.http
      .patch<ApiResponse<TenantAsset>>(`${environment.apiBaseUrl}/tenant/assets/${assetId}`, request)
      .pipe(map((response) => response.data));
  }

  updateStatus(assetId: string, request: UpdateAssetStatusRequest) {
    return this.http
      .patch<ApiResponse<TenantAsset>>(`${environment.apiBaseUrl}/tenant/assets/${assetId}/status`, request)
      .pipe(map((response) => response.data));
  }

  delete(assetId: string) {
    return this.http
      .delete<ApiResponse<null>>(`${environment.apiBaseUrl}/tenant/assets/${assetId}`)
      .pipe(map((response) => response.data));
  }
}
