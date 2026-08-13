import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const isAuthEndpoint = request.url.endsWith('/auth/login')
    || request.url.endsWith('/auth/refresh')
    || request.url.endsWith('/auth/logout');

  return from(isAuthEndpoint ? Promise.resolve<string | null>(null) : auth.validAccessToken()).pipe(
    switchMap((token) => {
      const tenantId = auth.tenantId();
      let headers = request.headers.set('X-Request-Source', 'tenant-portal');
      if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
      }
      if (tenantId) {
        headers = headers.set('X-Tenant-ID', tenantId);
      }

      return next(request.clone({ headers }));
    }),
    catchError((error) => {
      if (error.status === 401 && !request.url.endsWith('/auth/login')) {
        auth.clearSession();
        void router.navigate(['/login'], { queryParams: { session: 'expired' } });
      }
      return throwError(() => error);
    })
  );
};
