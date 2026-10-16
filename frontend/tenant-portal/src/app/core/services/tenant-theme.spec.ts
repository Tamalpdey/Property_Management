import { tenantBranding, tenantBrowserTitle } from '../../../../../packages/lorne-contracts/src/lib/tenant-branding';

describe('tenant branding', () => {
  it('uses the tenant primary color for PrimeNG, Tailwind and selected controls', () => {
    const theme = tenantBranding({ organizationName: 'Arrow Contracting', themePrimaryColor: '#006EA8' });
    expect(theme.variables['--tenant-primary']).toBe('#006ea8');
    expect(theme.variables['--color-teal-500']).toBe('#006ea8');
    expect(theme.variables['--p-primary-500']).toBe('#006ea8');
    expect(theme.preset.semantic.primary[500]).toBe('#006ea8');
    expect(theme.preset.semantic.colorScheme.light.primary.color).toBe('#006ea8');
    expect(Object.keys(theme.palette).length).toBe(11);
  });

  it('uses actual company name with the platform name in browser titles', () => {
    expect(tenantBrowserTitle({ organizationName: 'Arrow Contracting', tenantName: 'Lorne' })).toBe('Arrow Contracting | Maple Property Services');
    expect(tenantBrowserTitle({ tenantName: 'Platinum Residential Services' })).toBe('Platinum Residential Services | Maple Property Services');
    expect(tenantBrowserTitle({ organizationName: ' ', legalName: 'Arrow Inc.' })).toBe('Arrow Inc. | Maple Property Services');
    expect(tenantBrowserTitle({})).toBe('Maple Property Services');
    expect(tenantBrowserTitle({ organizationName: 'Maple Property Services' })).toBe('Maple Property Services');
  });

  it('never carries one tenant\'s palette or name into another tenant', () => {
    const arrow = tenantBranding({ organizationName: 'Arrow Contracting', themePrimaryColor: '#006ea8' });
    const platinum = tenantBranding({ organizationName: 'Platinum Residential Services', themePrimaryColor: '#0f766e' });
    expect(platinum.variables['--color-teal-300']).not.toBe(arrow.variables['--color-teal-300']);
    expect(platinum.title).not.toContain('Arrow');
    expect(tenantBranding({}).title).not.toContain('Platinum');
    expect(tenantBranding({}).variables['--tenant-primary']).toBe('#0f766e');
  });

  it('uses readable foregrounds for both light and dark tenant colors', () => {
    expect(tenantBranding({ themePrimaryColor: '#ffee00' }).variables['--tenant-primary-contrast']).toBe('#0f172a');
    expect(tenantBranding({ themePrimaryColor: '#006ea8' }).variables['--tenant-primary-contrast']).toBe('#ffffff');
    const yellow = tenantBranding({ themePrimaryColor: '#ffee00' });
    expect(yellow.preset.semantic.colorScheme.light.primary.inverseColor).toBe('#0f172a');
  });

  it('validates colors and resets all surface, radius and density tokens', () => {
    const theme = tenantBranding({ themePrimaryColor: 'red; display:none', themeNavigationColor: '#123', themePageBackgroundColor: '#fff', themeRadius: 'invalid' });
    expect(theme.variables['--tenant-primary']).toBe('#0f766e');
    expect(theme.variables['--tenant-navigation']).toBe('#0f172a');
    expect(theme.variables['--tenant-page-background']).toBe('#f4f7fb');
    expect(theme.variables['--tenant-radius']).toBe('.5rem');
    expect(theme.density).toBe('COMFORTABLE');
  });
});
