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
    <main class="grid min-h-screen place-items-center bg-slate-950 p-4">
      <p-card styleClass="w-full max-w-md">
        <div class="space-y-6">
          <div>
            <span class="grid h-12 w-12 place-items-center rounded-lg bg-teal-500 font-bold text-slate-950">L</span>
            <p class="mt-5 text-sm font-bold uppercase tracking-wide text-teal-700">Field mode</p>
            <h1 class="mt-2 text-3xl font-bold text-slate-950">Worker login</h1>
            <p class="mt-2 text-sm leading-6 text-slate-600">Large tap targets for travel, arrival, work, photos, and completion.</p>
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
              icon="pi pi-mobile"
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
      await this.auth.login({ email: this.email, password: this.password });
      await this.router.navigateByUrl('/today');
    } catch {
      this.error.set('Unable to sign in. Check credentials and backend status.');
    } finally {
      this.loading.set(false);
    }
  }
}
