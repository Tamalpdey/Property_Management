import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, PhotoUploadRequest, PresignedPhotoUpload, TenantSettingsRecord, UpdateTenantSettingsRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantSettingsService {
  private readonly http = inject(HttpClient);

  get() {
    return this.http
      .get<ApiResponse<TenantSettingsRecord>>(`${environment.apiBaseUrl}/tenant/settings`)
      .pipe(map((response) => response.data));
  }

  update(request: UpdateTenantSettingsRequest) {
    return this.http
      .put<ApiResponse<TenantSettingsRecord>>(`${environment.apiBaseUrl}/tenant/settings`, request)
      .pipe(map((response) => response.data));
  }

  logoUploadUrl(request: PhotoUploadRequest) {
    return this.http
      .post<ApiResponse<PresignedPhotoUpload>>(`${environment.apiBaseUrl}/tenant/settings/logo/upload-url`, request)
      .pipe(map((response) => response.data));
  }

  uploadLogo(upload: PresignedPhotoUpload, file: File) {
    return this.http.put(upload.uploadUrl, file, {
      headers: upload.headers,
      responseType: 'text'
    });
  }

  logoUrl(documentId: string): string {
    return `${environment.apiBaseUrl}/tenant/settings/logo/${documentId}`;
  }
}
