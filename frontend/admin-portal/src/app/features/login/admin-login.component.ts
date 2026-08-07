import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'lorne-admin-login',
  standalone: true,
  imports: [ButtonModule, CardModule, FormsModule, InputTextModule, PasswordModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-screen place-items-center bg-slate-950 p-4">
      <p-card styleClass="w-full max-w-md">
        <div class="space-y-6">
          <div>
            <span class="grid h-12 w-12 place-items-center rounded-lg bg-slate-950 font-bold text-white">L</span>
            <p class="mt-5 text-sm font-bold uppercase tracking-wide text-slate-600">Lorne platform</p>
            <h1 class="mt-2 text-3xl font-bold text-slate-950">Platform admin</h1>
            <p class="mt-2 text-sm leading-6 text-slate-600">Software-owner controls for tenants, health, audit, and readiness.</p>
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
              class="w-full"
              icon="pi pi-shield"
              [disabled]="loading()"
              [loading]="loading()"
              label="Sign in"
            ></button>
          </form>
        </div>
      </p-card>
    </main>
  `
})
export class AdminLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected email = 'superadmin@lorne.local';
  protected password = 'Password123!';
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  async login(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login({ email: this.email, password: this.password });
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.error.set('Unable to sign in. Check credentials and backend status.');
    } finally {
      this.loading.set(false);
    }
  }
}
