import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
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
