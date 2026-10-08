import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import type { TenantLoginBrandingRecord } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { TenantLoginBrandingService } from './tenant-login-branding.service';

@Component({
  selector: 'lorne-login',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule, PasswordModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host {
      --maple-green: #0f766e;
      --field-green: #0d9488;
      --field-ink: #102238;
      --field-sun: #facc15;
    }

    .worker-login {
      background:
        linear-gradient(135deg, rgba(20, 184, 166, 0.13), transparent 34rem),
        linear-gradient(180deg, #f8fbfa 0%, #eef5f7 100%);
    }

    .worker-login[data-pattern='GRID'] {
      background: linear-gradient(rgba(15, 118, 110, .045) 1px, transparent 1px), linear-gradient(90deg, rgba(15, 118, 110, .045) 1px, transparent 1px), linear-gradient(135deg, color-mix(in srgb, var(--login-primary) 12%, transparent), transparent 34rem), linear-gradient(180deg, #f8fbfa, var(--login-page));
      background-size: 42px 42px, 42px 42px, auto, auto;
    }
    .worker-login[data-pattern='NONE'] { background: var(--login-page); }

    .field-panel {
      background:
        linear-gradient(rgba(15, 118, 110, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 118, 110, 0.08) 1px, transparent 1px),
        linear-gradient(145deg, #f1faf7 0%, #e8f6f2 48%, #f8fafc 100%);
      background-size: 34px 34px, 34px 34px, auto;
    }

    .login-shell-focused { max-width: 34rem; }
    .login-shell-focused .login-grid { grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) { .login-grid-split { grid-template-columns: .95fr 1.05fr; } }

    .maple-leaf {
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
    }

  `],
  template: `
    <main class="worker-login grid min-h-dvh place-items-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8" [attr.data-pattern]="branding()?.loginBackgroundPattern || 'SUBTLE'" [style.--login-primary]="primaryColor()" [style.--login-page]="pageColor()">
      <section class="w-full max-w-5xl" [class.login-shell-focused]="branding()?.loginStyle && branding()?.loginStyle !== 'SPLIT'">
        <header class="mb-5 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            @if (branding()?.logoUrl) {
              <span class="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-white p-1 ring-1 ring-slate-200"><img class="max-h-full max-w-full object-contain" [src]="branding()?.logoUrl" alt="Company logo" /></span>
            } @else {
              <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1" [style.background]="primarySoft()"><span class="maple-leaf h-6 w-6" [style.background]="primaryColor()"></span></span>
            }
            <span>
              <span class="block text-sm font-black text-slate-950">{{ organizationName() }}</span>
              <span class="block text-xs font-bold text-slate-500">Worker field console</span>
            </span>
          </div>
          <span class="hidden rounded-full border border-teal-100 bg-white/70 px-3 py-1 text-xs font-black text-teal-700 shadow-sm sm:inline-flex">
            mobile access
          </span>
        </header>

        <div class="login-grid grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80" [class.login-grid-split]="!branding() || branding()?.loginStyle === 'SPLIT'">
          <section class="grid place-items-center bg-white p-5 sm:p-8">
            <div class="w-full max-w-sm rounded-xl border border-teal-100 bg-white p-5 shadow-lg shadow-slate-200/70 sm:p-6">
              <div class="space-y-5">
                <div>
                  <p class="text-xs font-black uppercase" [style.color]="primaryColor()">Worker access</p>
                  <h1 class="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{{ loginHeadline() }}</h1>
                  <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {{ loginMessage() }}
                  </p>
                </div>

                <form class="space-y-4" (ngSubmit)="login()">
                  <label class="block">
                    <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
                    <input pInputText class="h-11 w-full !text-base" name="email" autocomplete="username" [disabled]="!loginAllowed()" [(ngModel)]="email" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
                    <p-password
                      styleClass="w-full"
                      inputStyleClass="w-full h-11 !text-base"
                      name="password"
                      autocomplete="current-password"
                      [feedback]="false"
                      [toggleMask]="true"
                      [disabled]="!loginAllowed()"
                      [(ngModel)]="password"
                    />
                  </label>
                  @if (error()) {
                    <p class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
                  }
                  <button
                    pButton
                    type="submit"
                    class="w-full touch-action !text-base"
                    [style.background]="primaryColor()"
                    [style.border-color]="primaryColor()"
                    icon="pi pi-mobile"
                    [disabled]="loading() || !loginAllowed()"
                    [loading]="loading()"
                    label="Sign in"
                  ></button>
                </form>

                <div class="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-xs font-black text-slate-500">
                  <span>Jobs</span>
                  <span>Photos</span>
                  <span>Ticket</span>
                </div>
              </div>
            </div>
          </section>

          @if ((!branding() || branding()?.loginStyle === 'SPLIT') && (!branding() || branding()?.loginShowPreview)) {
          <section class="field-panel relative hidden min-h-[34rem] overflow-hidden p-8 lg:block">
            <div aria-hidden="true" class="maple-leaf absolute -right-10 top-8 h-44 w-44 bg-teal-200/35"></div>
            <div aria-hidden="true" class="absolute bottom-14 right-12 h-28 w-28 rounded-full border border-teal-200/70"></div>
            <div aria-hidden="true" class="absolute right-16 top-44 grid h-10 w-10 place-items-center rounded-full bg-yellow-300 text-slate-950 shadow-lg shadow-yellow-200/60">
              <i class="pi pi-camera"></i>
            </div>

            <div class="relative z-10 max-w-lg">
              <p class="text-xs font-black uppercase text-teal-700">Mobile service workflow</p>
              <h2 class="mt-3 text-3xl font-black leading-tight text-slate-950 xl:text-4xl">A simple console for workers on site.</h2>
              <p class="mt-4 text-sm font-semibold leading-6 text-slate-600">
                Built for quick field actions: clock in, open the next stop, add notes, capture photos, and close out the work cleanly.
              </p>
            </div>

            <div class="relative z-10 mt-8 grid gap-3">
              <div class="rounded-xl border border-slate-200 bg-white/85 p-4 shadow-lg shadow-slate-200/70 backdrop-blur">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs font-black uppercase text-slate-500">Next job</p>
                    <p class="mt-1 text-lg font-black text-slate-950">Pool maintenance</p>
                  </div>
                  <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-700">ready</span>
                </div>
                <div class="mt-4 grid grid-cols-3 gap-2 text-xs font-black text-slate-600">
                  <span class="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <i class="pi pi-clock mr-1 text-teal-700"></i>8:15 AM
                  </span>
                  <span class="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <i class="pi pi-map-marker mr-1 text-teal-700"></i>Arrive
                  </span>
                  <span class="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                    <i class="pi pi-camera mr-1 text-teal-700"></i>Photos
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-slate-200 bg-white/75 p-4">
                  <p class="text-xs font-black uppercase text-teal-700">Proof</p>
                  <p class="mt-2 text-sm font-black text-slate-950">Photos and notes stay with each job.</p>
                </div>
                <div class="rounded-xl border border-slate-200 bg-white/75 p-4">
                  <p class="text-xs font-black uppercase text-teal-700">Day ticket</p>
                  <p class="mt-2 text-sm font-black text-slate-950">Time and work records are ready for review.</p>
                </div>
              </div>
            </div>
          </section>
          }
        </div>
      </section>
    </main>
  `
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly brandingService = inject(TenantLoginBrandingService);
  protected readonly branding = signal<TenantLoginBrandingRecord | null>(null);
  protected readonly loginAllowed = signal(this.brandingService.isTenantLoginHost());
  protected email = '';
  protected password = '';
  protected readonly loading = signal(false);
  protected readonly error = signal(this.route.snapshot.queryParamMap.get('session') === 'expired'
    ? 'Your session expired. Sign in again to continue.'
    : '');

  constructor() {
    void this.loadBranding();
  }

  protected organizationName(): string { return this.branding()?.organizationName || 'Maple Property Services'; }
  protected loginHeadline(): string { return this.branding()?.loginHeadline || 'Start the field day'; }
  protected loginMessage(): string { return this.branding()?.loginMessage || 'Sign in to view assigned jobs, clock time, capture proof, and submit the day ticket.'; }
  protected primaryColor(): string { return this.branding()?.themePrimaryColor || '#0f766e'; }
  protected pageColor(): string { return this.branding()?.themePageBackgroundColor || '#f4f7fb'; }
  protected primarySoft(): string { return `color-mix(in srgb, ${this.primaryColor()} 14%, white)`; }

  private async loadBranding(): Promise<void> {
    if (!this.loginAllowed()) {
      this.error.set('Use the company-specific worker sign-in address provided by your administrator.');
      return;
    }
    const branding = await firstValueFrom(this.brandingService.load());
    this.branding.set(branding);
    if (!branding && !this.brandingService.isLocalDevelopmentHost()) {
      this.loginAllowed.set(false);
      this.error.set('This worker sign-in address is not active. Contact your administrator.');
    }
  }

  async login(): Promise<void> {
    if (this.loading() || !this.loginAllowed()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login({ email: this.email, password: this.password, tenantId: this.branding()?.tenantId });
      await this.router.navigateByUrl('/today');
    } catch (error) {
      this.error.set(this.loginError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private loginError(error: unknown): string {
    const message = (error as { error?: { error?: { message?: string } } })?.error?.error?.message;
    return message || 'Unable to sign in. Check your credentials or contact your administrator.';
  }
}
