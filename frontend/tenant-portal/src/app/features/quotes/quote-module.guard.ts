import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';

export const quoteModuleGuard: CanActivateFn = () => {
  const settingsService = inject(TenantSettingsService);
  const router = inject(Router);
  return settingsService.get().pipe(
    map((settings) => settings.quoteManagementEnabled ? true : router.createUrlTree(['/dashboard'])),
    catchError(() => of(router.createUrlTree(['/dashboard'])))
  );
};
