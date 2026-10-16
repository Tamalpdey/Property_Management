export interface TenantBrandingInput {
  timezone?: string;
  organizationName?: string;
  tenantName?: string;
  legalName?: string;
  themePrimaryColor?: string;
  themeAccentColor?: string;
  themeNavigationColor?: string;
  themeSurfaceColor?: string;
  themePageBackgroundColor?: string;
  themeRadius?: string;
  themeDensity?: string;
}

export function tenantBranding(settings: TenantBrandingInput) {
  const primary = color(settings.themePrimaryColor, '#0f766e');
  const navigation = color(settings.themeNavigationColor, '#0f172a');
  const palette: Record<string, string> = {};
  for (const [tone, weight] of [[50, .96], [100, .9], [200, .78], [300, .6], [400, .3]] as const) {
    palette[tone] = mix(primary, '#ffffff', weight);
  }
  palette[500] = primary;
  for (const [tone, weight] of [[600, .12], [700, .24], [800, .38], [900, .52], [950, .68]] as const) {
    palette[tone] = mix(primary, '#000000', weight);
  }
  const variables: Record<string, string> = {
    '--tenant-primary': primary,
    '--tenant-primary-hover': mix(primary, '#000000', .18),
    '--tenant-primary-soft': palette[100],
    '--tenant-primary-contrast': contrast(primary),
    '--tenant-accent': color(settings.themeAccentColor, '#2563eb'),
    '--tenant-navigation': navigation,
    '--tenant-navigation-soft': mix(navigation, '#ffffff', .12),
    '--tenant-navigation-contrast': contrast(navigation),
    '--tenant-surface': color(settings.themeSurfaceColor, '#ffffff'),
    '--tenant-page-background': color(settings.themePageBackgroundColor, '#f4f7fb'),
    '--tenant-radius': ({ SHARP: '.2rem', SMALL: '.5rem', ROUNDED: '.85rem' } as Record<string, string>)[settings.themeRadius || ''] || '.5rem',
    '--p-primary-color': primary,
    '--p-primary-hover-color': mix(primary, '#000000', .18),
    '--p-primary-active-color': mix(primary, '#000000', .28),
    '--p-primary-contrast-color': contrast(primary),
    '--p-primary-inverse-color': contrast(primary),
    '--p-focus-ring-color': palette[200]
  };
  for (const [tone, value] of Object.entries(palette)) {
    variables[`--p-primary-${tone}`] = value;
    variables[`--color-teal-${tone}`] = value;
  }
  const preset = { semantic: { primary: palette, colorScheme: { light: {
    primary: { color: primary, inverseColor: contrast(primary), hoverColor: variables['--tenant-primary-hover'], activeColor: variables['--p-primary-active-color'] },
    highlight: { background: variables['--tenant-primary-soft'], focusBackground: palette[200], color: palette[700], focusColor: palette[800] }
  } } } };
  return { variables, palette, preset, density: settings.themeDensity || 'COMFORTABLE', title: tenantBrowserTitle(settings) };
}

export function tenantBrowserTitle(settings: TenantBrandingInput): string {
  const name = [settings.organizationName, settings.tenantName, settings.legalName].find(value => value?.trim())?.trim();
  return name && name.toLowerCase() !== 'maple property services' ? `${name} | Maple Property Services` : 'Maple Property Services';
}

function color(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value!.toLowerCase() : fallback;
}

function rgb(value: string): number[] {
  return [1, 3, 5].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function mix(left: string, right: string, weight: number): string {
  const a = rgb(left), b = rgb(right);
  return `#${a.map((channel, index) => Math.round(channel * (1 - weight) + b[index] * weight).toString(16).padStart(2, '0')).join('')}`;
}

function luminance(value: string): number {
  const [r, g, b] = rgb(value).map(channel => {
    const c = channel / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}

function contrast(value: string): string {
  const background = luminance(value), dark = luminance('#0f172a');
  const whiteRatio = 1.05 / (background + .05);
  const darkRatio = (Math.max(background, dark) + .05) / (Math.min(background, dark) + .05);
  return whiteRatio >= darkRatio ? '#ffffff' : '#0f172a';
}
