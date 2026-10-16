import { Injectable, signal } from '@angular/core';
import { DEFAULT_TENANT_TIMEZONE, formatTenantTimestamp, tenantTimezone } from '../../../../../packages/lorne-contracts/src/lib/tenant-time';

@Injectable({ providedIn: 'root' })
export class TenantTimeService {
  readonly timezone = signal(DEFAULT_TENANT_TIMEZONE);

  apply(value?: string | null): void { this.timezone.set(tenantTimezone(value)); }

  format(value: string | number | Date, options: Intl.DateTimeFormatOptions): string {
    return formatTenantTimestamp(value, this.timezone(), options);
  }
}
