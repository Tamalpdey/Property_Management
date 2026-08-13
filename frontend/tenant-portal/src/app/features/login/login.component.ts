import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lorne-login',
  standalone: true,
  imports: [ButtonModule, CardModule, FormsModule, InputTextModule, PasswordModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-screen bg-slate-950 p-4 lg:grid-cols-[1.1fr_0.9fr] lg:p-0">
      <section class="hidden min-h-screen content-between p-10 text-white lg:grid">
        <div class="flex items-center gap-3">
          <span class="grid h-12 w-12 place-items-center rounded-lg bg-teal-400 font-bold text-slate-950">L</span>
          <div>
            <p class="text-sm font-bold">Lorne PropertyOps</p>
            <p class="text-xs font-medium text-slate-400">Tenant command center</p>
          </div>
        </div>
        <div class="max-w-2xl">
          <p class="text-xs font-bold uppercase tracking-wide text-teal-300">Owner / Property / Service</p>
          <h1 class="mt-4 text-5xl font-bold leading-tight">Run the full maintenance portfolio from one workspace.</h1>
          <p class="mt-5 text-base leading-7 text-slate-300">Owners, properties, catalog services, and worker readiness stay connected for day-to-day operations.</p>
        </div>
        <div class="grid grid-cols-3 gap-3 text-sm">
          <span class="rounded-lg border border-white/10 bg-white/5 p-4 font-semibold">Owners</span>
          <span class="rounded-lg border border-white/10 bg-white/5 p-4 font-semibold">Properties</span>
          <span class="rounded-lg border border-white/10 bg-white/5 p-4 font-semibold">Services</span>
        </div>
      </section>

      <section class="grid place-items-center lg:bg-white">
        <p-card styleClass="w-full max-w-md">
          <div class="space-y-6">
            <div>
              <p class="text-sm font-bold uppercase tracking-wide text-teal-700">Lorne</p>
              <h1 class="mt-2 text-3xl font-bold text-slate-950">Tenant admin login</h1>
              <p class="mt-2 text-sm leading-6 text-slate-600">Manage property owners, properties, and maintenance services.</p>
            </div>
            <form class="space-y-4" (ngSubmit)="login()">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
                <input pInputText class="w-full" name="email" autocomplete="username" [(ngModel)]="email" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
                <p-password
                  styleClass="w-full"
                  inputStyleClass="w-full"
                  name="password"
                  autocomplete="current-password"
                  [feedback]="false"
                  [(ngModel)]="password"
                />
              </label>
              @if (error()) {
                <p class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
              }
              <button
                pButton
                type="submit"
                class="w-full touch-action"
                icon="pi pi-sign-in"
                [disabled]="loading()"
                [loading]="loading()"
                label="Sign in"
              ></button>
            </form>
          </div>
        </p-card>
      </section>
    </main>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal(this.route.snapshot.queryParamMap.get('session') === 'expired'
    ? 'Your session expired. Sign in again to continue.'
    : '');

  async login(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login({ email: this.email, password: this.password });
      const canUseTenantPortal = user.roles.some((role) => ['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'].includes(role));
      if (!canUseTenantPortal) {
        this.auth.clearSession();
        this.error.set('This login is not enabled for the tenant portal. Workers should use the worker app.');
        return;
      }
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('Unable to sign in. Check credentials and backend status.');
    } finally {
      this.loading.set(false);
    }
  }
}
