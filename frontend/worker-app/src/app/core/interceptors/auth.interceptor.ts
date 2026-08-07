import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiBaseUrl)) {
    return next(request);
  }

  const token = localStorage.getItem('lorne.workerAccessToken');
  const tenantId = localStorage.getItem('lorne.workerTenantId');

  let headers = request.headers.set('X-Request-Source', 'worker-app');
  if (token) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }
  if (tenantId) {
    headers = headers.set('X-Tenant-ID', tenantId);
  }

  return next(request.clone({ headers }));
};
