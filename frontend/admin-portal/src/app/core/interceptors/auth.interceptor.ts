import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = localStorage.getItem('lorne.adminAccessToken');
  const headers = token
    ? request.headers.set('Authorization', `Bearer ${token}`).set('X-Request-Source', 'admin-portal')
    : request.headers.set('X-Request-Source', 'admin-portal');

  return next(request.clone({ headers }));
};
