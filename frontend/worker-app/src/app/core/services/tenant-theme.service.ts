import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { updatePreset } from '@primeng/themes';
import { tenantBranding, type TenantBrandingInput } from '../../../../../packages/lorne-contracts/src/lib/tenant-branding';
import { TenantTimeService } from './tenant-time.service';

@Injectable({ providedIn: 'root' })
export class TenantThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly time = inject(TenantTimeService);

  apply(settings: TenantBrandingInput): void {
    this.time.apply(settings.timezone);
    const theme = tenantBranding(settings);
    const root = this.document.documentElement;
    for (const [name, value] of Object.entries(theme.variables)) root.style.setProperty(name, value);
    updatePreset(theme.preset);
    root.dataset['tenantDensity'] = theme.density;
    this.document.title = theme.title;
  }
}
