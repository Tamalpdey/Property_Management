import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import type { CurrentUser } from '@lorne/contracts';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.hasValidSession()
    || router.createUrlTree(
      ['/login'],
      auth.shouldShowExpiredSessionMessage() ? { queryParams: { session: 'expired' } } : {}
    );
};

type TenantRole = CurrentUser['roles'][number];

export function roleGuard(allowedRoles: TenantRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    if (!auth.hasValidSession()) {
      return router.createUrlTree(
        ['/login'],
        auth.shouldShowExpiredSessionMessage() ? { queryParams: { session: 'expired' } } : {}
      );
    }
    return auth.hasAnyRole(allowedRoles) || router.createUrlTree(['/dashboard'], {
      queryParams: { access: 'denied' }
    });
  };
}
