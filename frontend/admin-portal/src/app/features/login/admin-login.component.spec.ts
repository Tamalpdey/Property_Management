import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AdminLoginComponent } from './admin-login.component';

describe('platform admin login', () => {
  let auth: jasmine.SpyObj<AuthService>;
  let router: jasmine.SpyObj<Router>;
  let component: AdminLoginComponent;
  let fields: { email: string; password: string };

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['login', 'signOut']);
    router = jasmine.createSpyObj<Router>('Router', ['navigateByUrl']);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ] });
    component = TestBed.runInInjectionContext(() => new AdminLoginComponent());
    fields = component as unknown as typeof fields;
  });

  it('never supplies default credentials', () => {
    expect(fields.email).toBe('');
    expect(fields.password).toBe('');
  });

  it('does not send an empty login request', async () => {
    await component.login();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('clears the password after a failed attempt', async () => {
    fields.email = 'admin@example.com'; fields.password = 'test-only-password';
    auth.login.and.rejectWith(new Error('Denied'));
    await component.login();
    expect(fields.password).toBe('');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
