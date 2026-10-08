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
      --maple-ink: #102238;
      --maple-mint: #dff7f2;
    }

    .tenant-login {
      position: relative;
      isolation: isolate;
      background:
        linear-gradient(rgba(15, 118, 110, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 118, 110, 0.045) 1px, transparent 1px),
        linear-gradient(135deg, rgba(15, 118, 110, 0.10), transparent 28rem),
        linear-gradient(315deg, rgba(14, 165, 233, 0.07), transparent 30rem),
        linear-gradient(180deg, #f8fbfa 0%, #eef5f7 100%);
      background-size: 42px 42px, 42px 42px, auto, auto, auto;
    }

    .tenant-login[data-pattern='SUBTLE'] {
      background: linear-gradient(135deg, color-mix(in srgb, var(--login-primary) 12%, white), transparent 32rem), linear-gradient(180deg, #fbfdfc, var(--login-page));
    }

    .tenant-login[data-pattern='NONE'] { background: var(--login-page); }

    .tenant-login::before,
    .tenant-login::after {
      content: '';
      position: absolute;
      z-index: -1;
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
      background: rgba(15, 118, 110, 0.055);
      pointer-events: none;
    }

    .tenant-login::before {
      left: 7%;
      top: 15%;
      width: 11rem;
      height: 11rem;
      transform: rotate(-18deg);
    }

    .tenant-login::after {
      right: 8%;
      bottom: 11%;
      width: 15rem;
      height: 15rem;
      transform: rotate(14deg);
    }

    .product-panel {
      background:
        linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
        linear-gradient(145deg, var(--login-nav) 0%, color-mix(in srgb, var(--login-nav) 78%, var(--login-primary)) 58%, color-mix(in srgb, var(--login-nav) 76%, var(--login-accent)) 100%);
      background-size: 36px 36px, 36px 36px, auto;
    }

    .maple-leaf {
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
    }

    :host ::ng-deep .login-card > .p-card-body {
      padding: 0;
    }

    :host ::ng-deep .login-card {
      box-shadow: none;
    }

    .login-shell-focused { max-width: 34rem; }
    .login-shell-focused .login-grid { grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1024px) { .login-grid-split { grid-template-columns: .9fr 1.1fr; } }
  `],
  template: `
    <main
      class="tenant-login grid min-h-screen place-items-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8"
      [attr.data-pattern]="branding()?.loginBackgroundPattern || 'GRID'"
      [style.--login-primary]="primaryColor()"
      [style.--login-accent]="accentColor()"
      [style.--login-nav]="navigationColor()"
      [style.--login-page]="pageColor()"
    >
      <section class="w-full max-w-5xl" [class.login-shell-focused]="branding()?.loginStyle && branding()?.loginStyle !== 'SPLIT'">
        <header class="mb-5 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            @if (branding()?.logoUrl) {
              <span class="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-white p-1 ring-1 ring-slate-200"><img class="max-h-full max-w-full object-contain" [src]="branding()?.logoUrl" alt="Company logo" /></span>
            } @else {
              <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1" [style.background]="primarySoft()" [style.color]="primaryColor()"><span class="maple-leaf h-6 w-6" [style.background]="primaryColor()"></span></span>
            }
            <span>
              <span class="block text-sm font-black text-slate-950">{{ organizationName() }}</span>
              <span class="block text-xs font-bold text-slate-500">Operations workspace</span>
            </span>
          </div>
          <span class="hidden rounded-full border bg-white/70 px-3 py-1 text-xs font-black shadow-sm sm:inline-flex" [style.border-color]="primarySoft()" [style.color]="primaryColor()">
            {{ websiteLabel() }}
          </span>
        </header>

        <div class="login-grid grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80" [class.login-grid-split]="!branding() || branding()?.loginStyle === 'SPLIT'">
          <section class="grid place-items-center bg-gradient-to-br from-white via-white to-teal-50/45 p-5 sm:p-8">
            <div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/70 sm:p-6">
              <div class="space-y-5">
                <div>
                  <p class="text-xs font-black uppercase" [style.color]="primaryColor()">Secure sign in</p>
                  <h1 class="mt-2 text-3xl font-black leading-tight text-slate-950">{{ loginHeadline() }}</h1>
                  <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">{{ loginMessage() }}</p>
                </div>
                <form class="space-y-4" (ngSubmit)="login()">
                  <label class="block">
                    <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
                    <input pInputText class="h-11 w-full" name="email" autocomplete="username" [disabled]="!loginAllowed()" [(ngModel)]="email" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
                    <p-password
                      styleClass="w-full"
                      inputStyleClass="w-full h-11"
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
                    class="w-full touch-action"
                    [style.background]="primaryColor()"
                    [style.border-color]="primaryColor()"
                    icon="pi pi-sign-in"
                    [disabled]="loading() || !loginAllowed()"
                    [loading]="loading()"
                    label="Sign in"
                  ></button>
                </form>
                <div class="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-xs font-black text-slate-500">
                  <span>Schedule</span>
                  <span>Review</span>
                  <span>Invoice</span>
                </div>
              </div>
            </div>
          </section>

          @if ((!branding() || branding()?.loginStyle === 'SPLIT') && (!branding() || branding()?.loginShowPreview)) {
          <section class="product-panel relative hidden min-h-[34rem] overflow-hidden p-8 text-white lg:block">
            <div aria-hidden="true" class="maple-leaf absolute -right-14 top-10 h-52 w-52 bg-teal-200/12"></div>
            <div aria-hidden="true" class="maple-leaf absolute bottom-10 left-10 h-14 w-14 rotate-12 bg-amber-200/25"></div>

            <div class="relative z-10 max-w-lg">
              <p class="text-xs font-black uppercase text-teal-200">Maintenance operations</p>
              <h1 class="mt-3 text-4xl font-black leading-tight">Run service work from one clear command center.</h1>
              <p class="mt-4 text-sm font-semibold leading-6 text-slate-200">
                Plan the day, review field records, invoice completed work, and keep owners informed.
              </p>
            </div>

            <div class="relative z-10 mt-8 rounded-lg border border-white/15 bg-white/12 p-4 shadow-xl shadow-slate-950/20 backdrop-blur">
              <div class="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
                <div>
                  <p class="text-xs font-black uppercase text-teal-100/80">Today</p>
                  <p class="text-lg font-black">Operations queue</p>
                </div>
                <span class="rounded-full bg-teal-200 px-3 py-1 text-xs font-black text-teal-950">Live</span>
              </div>

              <div class="grid grid-cols-3 gap-3">
                <div class="rounded-lg border border-white/10 bg-white/12 p-3">
                  <p class="text-xs font-black uppercase text-teal-100/75">Scheduled</p>
                  <p class="mt-1 text-2xl font-black">12</p>
                </div>
                <div class="rounded-lg border border-white/10 bg-white/12 p-3">
                  <p class="text-xs font-black uppercase text-teal-100/75">Review</p>
                  <p class="mt-1 text-2xl font-black text-amber-200">4</p>
                </div>
                <div class="rounded-lg border border-white/10 bg-white/12 p-3">
                  <p class="text-xs font-black uppercase text-teal-100/75">Invoice</p>
                  <p class="mt-1 text-2xl font-black">9</p>
                </div>
              </div>

              <div class="mt-4 overflow-hidden rounded-lg border border-white/10">
                <div class="grid grid-cols-[1fr_auto] bg-white/10 px-3 py-2 text-xs font-black uppercase text-teal-100/75">
                  <span>Work order</span>
                  <span>Status</span>
                </div>
                <div class="grid grid-cols-[1fr_auto] items-center border-t border-white/10 px-3 py-3 text-sm">
                  <span class="font-black">Pool maintenance</span>
                  <span class="rounded-full bg-teal-200 px-2 py-1 text-xs font-black text-teal-950">assigned</span>
                </div>
                <div class="grid grid-cols-[1fr_auto] items-center border-t border-white/10 px-3 py-3 text-sm">
                  <span class="font-black">Garden service</span>
                  <span class="rounded-full bg-amber-200 px-2 py-1 text-xs font-black text-amber-950">review</span>
                </div>
                <div class="grid grid-cols-[1fr_auto] items-center border-t border-white/10 px-3 py-3 text-sm">
                  <span class="font-black">Owner update</span>
                  <span class="rounded-full bg-blue-200 px-2 py-1 text-xs font-black text-blue-950">sent</span>
                </div>
              </div>
            </div>

            <div class="relative z-10 mt-5 grid grid-cols-3 gap-3 text-xs font-black text-teal-50">
              <span class="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/10">Work orders</span>
              <span class="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/10">Workers</span>
              <span class="rounded-lg bg-white/10 px-3 py-2 ring-1 ring-white/10">Invoices</span>
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
  protected loginHeadline(): string { return this.branding()?.loginHeadline || 'Welcome back'; }
  protected loginMessage(): string { return this.branding()?.loginMessage || 'Access your operations workspace.'; }
  protected primaryColor(): string { return this.branding()?.themePrimaryColor || '#0f766e'; }
  protected accentColor(): string { return this.branding()?.themeAccentColor || '#2563eb'; }
  protected navigationColor(): string { return this.branding()?.themeNavigationColor || '#0f172a'; }
  protected pageColor(): string { return this.branding()?.themePageBackgroundColor || '#f4f7fb'; }
  protected primarySoft(): string { return `color-mix(in srgb, ${this.primaryColor()} 14%, white)`; }
  protected websiteLabel(): string {
    return (this.branding()?.websiteUrl || 'maplepropertyservices.ca').replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  private async loadBranding(): Promise<void> {
    if (!this.loginAllowed()) {
      this.error.set('Use the company-specific tenant sign-in address provided by your administrator.');
      return;
    }
    const branding = await firstValueFrom(this.brandingService.load());
    this.branding.set(branding);
    if (!branding && !this.brandingService.isLocalDevelopmentHost()) {
      this.loginAllowed.set(false);
      this.error.set('This tenant sign-in address is not active. Contact your administrator.');
    }
  }

  async login(): Promise<void> {
    if (this.loading() || !this.loginAllowed()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const user = await this.auth.login({ email: this.email, password: this.password, tenantId: this.branding()?.tenantId });
      const canUseTenantPortal = user.roles.some((role) => ['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'].includes(role));
      if (!canUseTenantPortal) {
        this.auth.clearSession();
        this.error.set('This login is not enabled for the tenant portal. Workers should use the worker app.');
        return;
      }
      await this.router.navigateByUrl('/dashboard');
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
