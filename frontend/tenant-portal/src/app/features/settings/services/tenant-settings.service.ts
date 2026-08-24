import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  EmailDeliveryLogRecord,
  PhotoUploadRequest,
  PresignedPhotoUpload,
  ResendEmailDeliveryRequest,
  TenantSettingsRecord,
  TestTenantEmailRequest,
  TestTenantEmailResponse,
  UpdateTenantSettingsRequest
} from '@lorne/contracts';
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

  sendTestEmail(request: TestTenantEmailRequest) {
    return this.http
      .post<ApiResponse<TestTenantEmailResponse>>(`${environment.apiBaseUrl}/tenant/settings/test-email`, request)
      .pipe(map((response) => response.data));
  }

  emailDeliveries(limit = 50) {
    return this.http
      .get<ApiResponse<EmailDeliveryLogRecord[]>>(`${environment.apiBaseUrl}/tenant/email-deliveries`, { params: { limit } })
      .pipe(map((response) => response.data));
  }

  resendEmailDelivery(deliveryId: string, request: ResendEmailDeliveryRequest) {
    return this.http
      .post<ApiResponse<EmailDeliveryLogRecord>>(`${environment.apiBaseUrl}/tenant/email-deliveries/${deliveryId}/resend`, request)
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
