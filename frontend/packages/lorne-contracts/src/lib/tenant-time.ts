export const DEFAULT_TENANT_TIMEZONE = 'America/Toronto';

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

export function tenantTimezone(value?: string | null): string {
  const zone = value?.trim() || DEFAULT_TENANT_TIMEZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TENANT_TIMEZONE;
  }
}

// Angular DatePipe accepts numeric offsets; resolve the offset at the instant,
// not at today's date, so historical dates use the correct daylight-saving rule.
export function tenantTimezoneOffset(value: string | number | Date, timezone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '+0000';
  let formatter = offsetFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' });
    offsetFormatters.set(timezone, formatter);
  }
  const offset = formatter.formatToParts(date).find(part => part.type === 'timeZoneName')?.value || 'GMT';
  return offset === 'GMT' ? '+0000' : offset.slice(3).replace(':', '');
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatTenantTimestamp(value: string | number | Date, timezone: string, options: Intl.DateTimeFormatOptions): string {
  const date = isCalendarDate(value) ? new Date(value + 'T00:00:00Z') : new Date(value);
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone: isCalendarDate(value) ? 'UTC' : timezone }).format(date);
}
