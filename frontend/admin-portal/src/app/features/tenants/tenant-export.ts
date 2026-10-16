import type { SuperAdminTenantSummary } from '@lorne/contracts';

export function tenantCsv(tenants: SuperAdminTenantSummary[]): string {
  const rows = [
    ['Organization', 'Legal name', 'Subdomain', 'Status', 'Plan', 'Administrator', 'Active users', 'Active admins', 'Active properties', 'Quotes enabled'],
    ...tenants.map(tenant => [tenant.displayName, tenant.legalName, tenant.portalSubdomain, tenant.status,
      tenant.planCode, tenant.administratorEmail || '', String(tenant.activeUsers), tenant.activeAdministrators === undefined ? '' : String(tenant.activeAdministrators), String(tenant.activeProperties), tenant.quoteManagementEnabled ? 'Yes' : 'No']),
  ];
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  const safe = /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}
