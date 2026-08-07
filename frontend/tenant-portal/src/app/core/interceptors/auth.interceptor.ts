import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem('lorne.accessToken');
  const tenantId = localStorage.getItem('lorne.tenantId');

  let headers = request.headers.set('X-Request-Source', 'tenant-portal');
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  if (tenantId) {
    headers = headers.set('X-Tenant-ID', tenantId);
  }

  return next(request.clone({ headers }));
};
