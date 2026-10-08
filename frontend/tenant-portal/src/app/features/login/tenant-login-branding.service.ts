import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, TenantLoginBrandingRecord } from '@lorne/contracts';
import { catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TenantLoginBrandingService {
  private readonly http = inject(HttpClient);

  load() {
    const tenant = this.resolveTenant();
    if (!tenant) {
      return of<TenantLoginBrandingRecord | null>(null);
    }
    return this.http
      .get<ApiResponse<TenantLoginBrandingRecord>>(`${environment.apiBaseUrl}/public/tenant-branding`, { params: { tenant } })
      .pipe(map((response) => response.data), catchError(() => of(null)));
  }

  isLocalDevelopmentHost(): boolean {
    const hostname = window.location.hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost');
  }

  isTenantLoginHost(): boolean {
    return this.isLocalDevelopmentHost() || this.tenantFromHostname() !== null;
  }

  private resolveTenant(): string | null {
    const requested = new URLSearchParams(window.location.search).get('tenant')?.trim().toLowerCase();
    if (requested && this.isLocalDevelopmentHost()) {
      return requested;
    }
    return this.tenantFromHostname();
  }

  private tenantFromHostname(): string | null {
    if (this.isLocalDevelopmentHost()) {
      return null;
    }
    const hostname = window.location.hostname.toLowerCase();
    const parts = hostname.split('.');
    return parts.length >= 4 && parts[1] === 'app' ? parts[0] : null;
  }
}
