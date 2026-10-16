import { TestBed } from '@angular/core/testing';
import { TenantDatePipe } from './tenant-date.pipe';
import { TenantTimeService } from '../core/services/tenant-time.service';
import { tenantTimezone, tenantTimezoneOffset } from '../../../../packages/lorne-contracts/src/lib/tenant-time';
import { timeOnly, ticketTimeLabel } from '../../../../packages/lorne-contracts/src/lib/report-generation';

describe('tenant timezone display', () => {
  let pipe: TenantDatePipe;
  let time: TenantTimeService;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    time = TestBed.inject(TenantTimeService);
    pipe = TestBed.runInInjectionContext(() => new TenantDatePipe());
  });
  it('renders UTC in the configured local timezone without changing the instant', () => {
    const value = '2026-10-15T01:30:00Z';
    time.apply('America/Toronto');
    expect(pipe.transform(value, 'yyyy-MM-dd HH:mm')).toBe('2026-10-14 21:30');
    time.apply('Asia/Kolkata');
    expect(pipe.transform(value, 'yyyy-MM-dd HH:mm')).toBe('2026-10-15 07:00');
    time.apply('UTC');
    expect(pipe.transform(value, 'yyyy-MM-dd HH:mm')).toBe('2026-10-15 01:30');
    expect(value).toBe('2026-10-15T01:30:00Z');
  });
  it('uses the offset of each instant across daylight-saving changes', () => {
    time.apply('America/Toronto');
    expect(pipe.transform('2026-03-08T06:30:00Z', 'HH:mm')).toBe('01:30');
    expect(pipe.transform('2026-03-08T07:30:00Z', 'HH:mm')).toBe('03:30');
    expect(tenantTimezoneOffset('2026-11-01T05:30:00Z', 'America/Toronto')).toBe('-0400');
    expect(tenantTimezoneOffset('2026-11-01T06:30:00Z', 'America/Toronto')).toBe('-0500');
  });
  it('never shifts calendar-only values', () => {
    for (const zone of ['America/Toronto', 'Pacific/Auckland', 'UTC']) {
      time.apply(zone);
      expect(pipe.transform('2026-10-14', 'yyyy-MM-dd')).toBe('2026-10-14');
    }
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform('')).toBeNull();
  });
  it('supports fractional-hour offsets and safe fallbacks', () => {
    expect(tenantTimezoneOffset('2026-10-15T01:30:00Z', 'Asia/Kathmandu')).toBe('+0545');
    expect(tenantTimezone('invalid')).toBe('America/Toronto');
    expect(tenantTimezone('UTC')).toBe('UTC');
  });
  it('honors explicit overrides and day ticket timezone selection', () => {
    time.apply('America/Toronto');
    expect(pipe.transform('2026-10-15T01:30:00Z', 'HH:mm', 'UTC')).toBe('01:30');
    expect(timeOnly('2026-10-15T01:30:00Z', '-', 'America/Toronto')).toBe('9:30 PM');
    expect(ticketTimeLabel('2026-10-15T01:30:00Z', '2026-10-14', '2026-10-15', '-', 'America/Toronto')).toContain('Oct 14, 2026');
  });
});
