import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, type ActivatedRouteSnapshot, type RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';

describe('platform admin route guard', () => {
  function evaluate(authenticated: boolean, roles: string[]) {
    const denied = new UrlTree();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { isAuthenticated: () => authenticated, currentUser: () => ({ roles }) } },
      { provide: Router, useValue: { createUrlTree: () => denied } },
    ] });
    return { result: TestBed.runInInjectionContext(() => authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)), denied };
  }

  it('allows a signed-in platform administrator', () => {
    expect(evaluate(true, ['SUPER_ADMIN']).result).toBeTrue();
  });
  it('does not treat a tenant administrator as a platform administrator', () => {
    const { result, denied } = evaluate(true, ['TENANT_ADMIN']);
    expect(result).toBe(denied);
  });
  it('requires sign in even if stale platform roles remain', () => {
    const { result, denied } = evaluate(false, ['SUPER_ADMIN']);
    expect(result).toBe(denied);
  });
});
