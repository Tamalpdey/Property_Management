import { DatePipe } from '@angular/common';
import { inject, LOCALE_ID, Pipe, PipeTransform } from '@angular/core';
import { isCalendarDate, tenantTimezoneOffset } from '../../../../packages/lorne-contracts/src/lib/tenant-time';
import { TenantTimeService } from '../core/services/tenant-time.service';

@Pipe({ name: 'date', standalone: true, pure: false })
export class TenantDatePipe implements PipeTransform {
  private readonly time = inject(TenantTimeService);
  private readonly locale = inject(LOCALE_ID);
  private readonly formatter = new DatePipe(this.locale);
  private cached?: { value: string | number; format: string; zone: string; locale?: string; result: string | null };

  transform(value: string | number | Date | null | undefined, format = 'mediumDate', timezone?: string, locale?: string): string | null {
    if (value == null || value === '') return null;
    const zone = timezone || this.time.timezone();
    const key = value instanceof Date ? value.getTime() : value;
    if (this.cached?.value === key && this.cached.format === format && this.cached.zone === zone && this.cached.locale === locale) return this.cached.result;
    const offset = isCalendarDate(value) ? undefined : timezone || tenantTimezoneOffset(value, zone);
    const result = this.formatter.transform(value, format, offset, locale);
    this.cached = { value: key, format, zone, locale, result };
    return result;
  }
}
