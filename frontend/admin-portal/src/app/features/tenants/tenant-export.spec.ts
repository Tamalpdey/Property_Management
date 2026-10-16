import type { SuperAdminTenantSummary } from '@lorne/contracts';
import { tenantCsv } from './tenant-export';

describe('tenant export', () => {
  const tenant = (displayName: string): SuperAdminTenantSummary => ({ id: 'test', displayName, legalName: 'Legal, "Limited"', portalSubdomain: 'test', status: 'ACTIVE', planCode: 'starter', activeUsers: 1, activeAdministrators: 1, activeProperties: 2, quoteManagementEnabled: true, countryCode: 'CA', timezone: 'America/Toronto', createdAt: '2026-10-14' });

  it('quotes embedded delimiters and double quotes', () => {
    expect(tenantCsv([tenant('North Shore')])).toContain('"Legal, ""Limited"""');
    expect(tenantCsv([tenant('North Shore')])).toContain('"1","2","Yes"');
  });

  it('neutralizes spreadsheet formulas including leading whitespace', () => {
    for (const name of ['=HYPERLINK("x")', ' +command', '@SUM(A1)', '-10', '\tformula']) {
      expect(tenantCsv([tenant(name)])).toContain('"\'' + name.replaceAll('"', '""') + '"');
    }
  });

  it('exports headers even with an empty filtered list', () => {
    expect(tenantCsv([]).split('\r\n').length).toBe(2);
  });
});
