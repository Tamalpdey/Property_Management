import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { TenantSettingsRecord } from '@lorne/contracts';

@Injectable({ providedIn: 'root' })
export class TenantThemeService {
  private readonly document = inject(DOCUMENT);

  apply(settings: TenantSettingsRecord): void {
    const root = this.document.documentElement;
    const primary = color(settings.themePrimaryColor, '#0f766e');
    const accent = color(settings.themeAccentColor, '#2563eb');
    const navigation = color(settings.themeNavigationColor, '#0f172a');
    const surface = color(settings.themeSurfaceColor, '#ffffff');
    const page = color(settings.themePageBackgroundColor, '#f4f7fb');
    const radius = { SHARP: '0.2rem', SMALL: '0.5rem', ROUNDED: '0.85rem' }[settings.themeRadius] || '0.5rem';

    root.style.setProperty('--tenant-primary', primary);
    root.style.setProperty('--tenant-primary-hover', mix(primary, '#000000', 0.18));
    root.style.setProperty('--tenant-primary-soft', mix(primary, '#ffffff', 0.9));
    root.style.setProperty('--tenant-primary-contrast', contrast(primary));
    root.style.setProperty('--tenant-accent', accent);
    root.style.setProperty('--tenant-navigation', navigation);
    root.style.setProperty('--tenant-navigation-soft', mix(navigation, '#ffffff', 0.12));
    root.style.setProperty('--tenant-navigation-contrast', contrast(navigation));
    root.style.setProperty('--tenant-surface', surface);
    root.style.setProperty('--tenant-page-background', page);
    root.style.setProperty('--tenant-radius', radius);
    root.style.setProperty('--p-primary-color', primary);
    root.style.setProperty('--p-primary-hover-color', mix(primary, '#000000', 0.18));
    root.style.setProperty('--p-primary-active-color', mix(primary, '#000000', 0.28));
    root.style.setProperty('--p-primary-contrast-color', contrast(primary));
    root.dataset['tenantDensity'] = settings.themeDensity || 'COMFORTABLE';
  }
}

function color(value: string | undefined, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value! : fallback;
}

function mix(left: string, right: string, rightWeight: number): string {
  const a = rgb(left);
  const b = rgb(right);
  return `#${[0, 1, 2].map((index) => Math.round(a[index] * (1 - rightWeight) + b[index] * rightWeight).toString(16).padStart(2, '0')).join('')}`;
}

function contrast(value: string): string {
  const [red, green, blue] = rgb(value).map((part) => {
    const channel = part / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.48 ? '#0f172a' : '#ffffff';
}

function rgb(value: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}
