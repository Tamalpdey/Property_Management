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
  styles: [`
    :host {
      --maple-green: #0f766e;
      --maple-forest: #082f2b;
      --maple-ink: #102238;
      --maple-gold: #f2b84b;
    }

    .maple-login {
      background:
        linear-gradient(115deg, rgba(11, 95, 88, 0.12), transparent 34rem),
        linear-gradient(180deg, #f7fbff 0%, #edf7f4 100%);
    }

    .maple-hero {
      background:
        linear-gradient(rgba(255, 255, 255, 0.055) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.055) 1px, transparent 1px),
        linear-gradient(135deg, #062d2f 0%, #0b3f47 45%, #123b65 100%);
      background-size: 48px 48px, 48px 48px, auto;
    }

    .maple-leaf {
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
    }

    .maple-road {
      background:
        linear-gradient(90deg, rgba(45, 212, 191, 0.8), rgba(242, 184, 75, 0.85)),
        linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
    }
  `],
  template: `
    <main
      class="maple-login grid min-h-screen overflow-hidden lg:grid-cols-[minmax(0,1fr)_30rem]"
    >
      <section class="maple-hero relative hidden min-h-screen content-between overflow-hidden p-10 text-white lg:grid">
        <div aria-hidden="true" class="maple-leaf absolute -right-28 top-16 h-96 w-96 bg-teal-200/10"></div>
        <div aria-hidden="true" class="maple-leaf absolute bottom-24 right-36 h-24 w-24 rotate-12 bg-amber-300/20"></div>
        <div aria-hidden="true" class="maple-road absolute bottom-28 left-10 h-1 w-[44rem] -rotate-12 rounded-full opacity-45"></div>

        <div class="relative z-10 flex items-center gap-3">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-teal-300 text-sm font-black text-slate-950 shadow-lg shadow-teal-950/30">
            <span class="maple-leaf h-7 w-7 bg-slate-950"></span>
          </span>
          <div>
            <p class="text-sm font-black">Maple Property Services</p>
            <p class="text-xs font-medium text-cyan-100/75">Operations workspace</p>
          </div>
        </div>

        <div class="relative z-10 max-w-2xl">
          <p class="text-xs font-black uppercase tracking-wide text-teal-200">maplepropertyservices.ca</p>
          <h1 class="mt-4 max-w-xl text-5xl font-black leading-tight">Field service built around real maintenance work.</h1>
          <p class="mt-5 max-w-lg text-base font-semibold leading-7 text-slate-200">
            Coordinate crews, routes, work orders, photos, maintenance records, invoices, and owner communication from one clean Maple workspace.
          </p>
          <div class="mt-8 grid max-w-2xl grid-cols-3 gap-3 text-sm">
            <div class="rounded-lg border border-white/12 bg-white/10 p-4 backdrop-blur">
              <i class="pi pi-calendar-clock text-teal-200"></i>
              <span class="mt-3 block font-black">Schedule</span>
              <span class="mt-1 block text-xs font-semibold leading-5 text-slate-300">Plan visits and routes</span>
            </div>
            <div class="rounded-lg border border-white/12 bg-white/10 p-4 backdrop-blur">
              <i class="pi pi-users text-teal-200"></i>
              <span class="mt-3 block font-black">Crew work</span>
              <span class="mt-1 block text-xs font-semibold leading-5 text-slate-300">Track worker activity</span>
            </div>
            <div class="rounded-lg border border-white/12 bg-white/10 p-4 backdrop-blur">
              <i class="pi pi-send text-teal-200"></i>
              <span class="mt-3 block font-black">Customers</span>
              <span class="mt-1 block text-xs font-semibold leading-5 text-slate-300">Send audited updates</span>
            </div>
          </div>
        </div>

        <div class="relative z-10 grid grid-cols-[1fr_auto] items-end gap-8">
          <div class="max-w-md rounded-lg border border-white/12 bg-white/10 p-4 backdrop-blur">
            <p class="text-xs font-black uppercase tracking-wide text-teal-200">Today’s operating rhythm</p>
            <div class="mt-4 grid gap-3">
              <div class="grid grid-cols-[4rem_1fr] gap-3">
                <span class="text-xs font-black text-slate-300">07:30</span>
                <span class="rounded-md bg-white/10 px-3 py-2 text-sm font-bold">Workers clock in and collect equipment</span>
              </div>
              <div class="grid grid-cols-[4rem_1fr] gap-3">
                <span class="text-xs font-black text-slate-300">10:15</span>
                <span class="rounded-md bg-white/10 px-3 py-2 text-sm font-bold">Photos, notes, and service records arrive from the field</span>
              </div>
              <div class="grid grid-cols-[4rem_1fr] gap-3">
                <span class="text-xs font-black text-slate-300">15:45</span>
                <span class="rounded-md bg-white/10 px-3 py-2 text-sm font-bold">Operations reviews, invoices, and emails owners</span>
              </div>
            </div>
          </div>
          <p class="text-right text-xs font-bold uppercase tracking-wide text-teal-100/80">Maintenance · Pools · Landscaping · Property care</p>
        </div>
      </section>

      <section class="grid min-h-screen place-items-center p-4 lg:bg-white/78 lg:p-8 lg:backdrop-blur">
        <p-card styleClass="w-full max-w-md border-0 shadow-2xl">
          <div class="space-y-5">
            <div>
              <div class="mb-5 flex items-center gap-3 lg:hidden">
                <span class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-teal-100 text-teal-800">
                  <span class="maple-leaf h-7 w-7 bg-teal-700"></span>
                </span>
                <span>
                  <span class="block text-sm font-black text-slate-950">Maple Property Services</span>
                  <span class="block text-xs font-bold text-slate-500">Operations workspace</span>
                </span>
              </div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Secure workspace</p>
              <h1 class="mt-2 text-3xl font-black text-slate-950">Sign in to Maple operations</h1>
              <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">Manage work orders, workers, maintenance records, invoices, and customer communication.</p>
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
                  [toggleMask]="true"
                  [(ngModel)]="password"
                />
              </label>
              @if (error()) {
                <p class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error() }}</p>
              }
              <button
                pButton
                type="submit"
                class="w-full touch-action !border-teal-600 !bg-teal-600 hover:!border-teal-700 hover:!bg-teal-700"
                icon="pi pi-sign-in"
                [disabled]="loading()"
                [loading]="loading()"
                label="Sign in"
              ></button>
            </form>
            <div class="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-xs font-black text-slate-500">
              <span>Field work</span>
              <span>Audit</span>
              <span>Email</span>
            </div>
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
