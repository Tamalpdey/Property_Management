import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, AuditLogRecord } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantAuditService {
  private readonly http = inject(HttpClient);

  list(limit = 250, resourceType?: string, resourceId?: string) {
    const params: Record<string, string | number> = { limit };
    if (resourceType && resourceId) {
      params['resourceType'] = resourceType;
      params['resourceId'] = resourceId;
    }
    return this.http
      .get<ApiResponse<AuditLogRecord[]>>(`${environment.apiBaseUrl}/tenant/audit-logs`, { params })
      .pipe(map((response) => response.data));
  }
}
