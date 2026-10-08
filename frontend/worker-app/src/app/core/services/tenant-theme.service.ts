import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import type { TenantSettingsRecord } from '@lorne/contracts';

@Injectable({ providedIn: 'root' })
export class TenantThemeService {
  private readonly document = inject(DOCUMENT);

  apply(settings: TenantSettingsRecord): void {
    const root = this.document.documentElement;
    const primary = color(settings.themePrimaryColor, '#0f766e');
    const navigation = color(settings.themeNavigationColor, '#0f172a');
    root.style.setProperty('--tenant-primary', primary);
    root.style.setProperty('--tenant-primary-hover', mix(primary, '#000000', 0.18));
    root.style.setProperty('--tenant-primary-soft', mix(primary, '#ffffff', 0.9));
    root.style.setProperty('--tenant-primary-contrast', contrast(primary));
    root.style.setProperty('--tenant-navigation', navigation);
    root.style.setProperty('--tenant-navigation-contrast', contrast(navigation));
    root.style.setProperty('--tenant-surface', color(settings.themeSurfaceColor, '#ffffff'));
    root.style.setProperty('--tenant-page-background', color(settings.themePageBackgroundColor, '#eef7f5'));
    root.style.setProperty('--tenant-radius', { SHARP: '0.2rem', SMALL: '0.5rem', ROUNDED: '0.85rem' }[settings.themeRadius] || '0.5rem');
    root.style.setProperty('--p-primary-color', primary);
    root.style.setProperty('--p-primary-hover-color', mix(primary, '#000000', 0.18));
    root.style.setProperty('--p-primary-active-color', mix(primary, '#000000', 0.28));
    root.style.setProperty('--p-primary-contrast-color', contrast(primary));
    root.dataset['tenantDensity'] = settings.themeDensity || 'COMFORTABLE';
  }
}

function color(value: string | undefined, fallback: string): string { return /^#[0-9a-f]{6}$/i.test(value || '') ? value! : fallback; }
function rgb(value: string): [number, number, number] { return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number]; }
function mix(left: string, right: string, weight: number): string { const a = rgb(left); const b = rgb(right); return `#${[0, 1, 2].map((i) => Math.round(a[i] * (1 - weight) + b[i] * weight).toString(16).padStart(2, '0')).join('')}`; }
function contrast(value: string): string { const [r, g, b] = rgb(value).map((part) => { const c = part / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.48 ? '#0f172a' : '#ffffff'; }
