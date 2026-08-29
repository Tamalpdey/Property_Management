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
      --maple-sky: #dff7f2;
      --maple-gold: #f2b84b;
    }

    .worker-login {
      background:
        radial-gradient(circle at 18% 14%, rgba(45, 212, 191, 0.22), transparent 16rem),
        radial-gradient(circle at 90% 92%, rgba(242, 184, 75, 0.2), transparent 18rem),
        linear-gradient(160deg, #031b1e 0%, #073536 48%, #102238 100%);
    }

    .worker-hero {
      background:
        radial-gradient(circle at 18% 24%, rgba(45, 212, 191, 0.18), transparent 18rem),
        radial-gradient(circle at 80% 72%, rgba(242, 184, 75, 0.16), transparent 16rem),
        linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px),
        linear-gradient(145deg, #052f2c 0%, #0f4c55 52%, #173f6b 100%);
      background-size: auto, auto, 46px 46px, 46px 46px, auto;
    }

    .maple-leaf {
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
    }

    .field-pin {
      box-shadow: 0 0 0 8px rgba(45, 212, 191, 0.1), 0 16px 38px rgba(4, 47, 46, 0.28);
    }

    .maple-leaf-wash {
      background:
        radial-gradient(circle at 50% 50%, rgba(242, 184, 75, 0.18), transparent 60%),
        rgba(45, 212, 191, 0.12);
      filter: blur(0.2px);
    }

    :host ::ng-deep .worker-login-card > .p-card-body {
      padding: 0;
    }

    :host ::ng-deep .worker-login-card {
      background: transparent;
      box-shadow: none;
    }
  `],
  template: `
    <main class="worker-login grid min-h-dvh overflow-hidden lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section class="worker-hero relative hidden min-h-screen content-between overflow-hidden p-8 text-white lg:grid">
        <div aria-hidden="true" class="maple-leaf absolute -right-24 top-14 h-80 w-80 bg-teal-200/8"></div>
        <div aria-hidden="true" class="absolute bottom-56 left-20 flex w-[28rem] -rotate-12 items-center justify-between opacity-16">
          <span class="maple-leaf h-8 w-8 bg-teal-200"></span>
          <span class="maple-leaf h-10 w-10 bg-amber-200"></span>
          <span class="maple-leaf h-8 w-8 bg-teal-100"></span>
        </div>
        <div aria-hidden="true" class="absolute left-[48%] top-[28%] h-40 w-40 rounded-full border border-teal-200/10 bg-teal-200/5"></div>
        <div aria-hidden="true" class="absolute left-[67%] top-[42%] h-48 w-48 rounded-full border border-amber-200/10 bg-amber-200/5"></div>
        <div aria-hidden="true" class="field-pin absolute left-[54%] top-[39%] grid h-11 w-11 place-items-center rounded-full bg-white/90 text-teal-800">
          <i class="pi pi-clock"></i>
        </div>
        <div aria-hidden="true" class="field-pin absolute left-[64%] top-[27%] grid h-12 w-12 place-items-center rounded-full bg-teal-300 text-slate-950">
          <i class="pi pi-map-marker"></i>
        </div>
        <div aria-hidden="true" class="field-pin absolute left-[73%] top-[45%] grid h-11 w-11 place-items-center rounded-full bg-amber-300 text-slate-950">
          <i class="pi pi-camera"></i>
        </div>
        <div aria-hidden="true" class="field-pin absolute left-[63%] top-[61%] grid h-10 w-10 place-items-center rounded-full bg-teal-100 text-teal-800">
          <i class="pi pi-check"></i>
        </div>

        <div class="relative z-10 flex items-center gap-3">
          <span class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-teal-300 text-slate-950 shadow-lg shadow-teal-950/30">
            <span class="maple-leaf h-7 w-7 bg-slate-950"></span>
          </span>
          <div>
            <p class="text-sm font-black">Maple Property Services</p>
            <p class="text-xs font-semibold text-teal-100/80">Mobile field console</p>
          </div>
        </div>

        <div class="relative z-10 max-w-xl">
          <p class="text-xs font-black uppercase tracking-wide text-teal-200">field work · service records · day tickets</p>
          <h1 class="mt-4 text-5xl font-black leading-tight">Everything workers need for the day, ready on the road.</h1>
          <p class="mt-5 max-w-lg text-base font-semibold leading-7 text-slate-200">
            Start the shift, open jobs, follow route stops, capture photos, record notes, and submit clean maintenance records to operations.
          </p>
        </div>

        <div class="relative z-10 grid max-w-4xl gap-3">
          <div class="grid grid-cols-4 gap-3 text-sm">
            <span class="rounded-lg border border-white/12 bg-white/8 p-3 font-black backdrop-blur">
              <i class="pi pi-clock mr-2 text-teal-200"></i>Clock in
            </span>
            <span class="rounded-lg border border-white/12 bg-white/8 p-3 font-black backdrop-blur">
              <i class="pi pi-map-marker mr-2 text-teal-200"></i>Arrive
            </span>
            <span class="rounded-lg border border-white/12 bg-white/8 p-3 font-black backdrop-blur">
              <i class="pi pi-camera mr-2 text-teal-200"></i>Photos
            </span>
            <span class="rounded-lg border border-white/12 bg-white/8 p-3 font-black backdrop-blur">
              <i class="pi pi-check-circle mr-2 text-teal-200"></i>Submit
            </span>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div class="rounded-lg border border-white/12 bg-white/8 p-4 backdrop-blur">
              <p class="text-xs font-black uppercase tracking-wide text-teal-200">Next stop</p>
              <p class="mt-2 text-sm font-black">Route and arrival</p>
              <p class="mt-1 text-xs font-semibold leading-5 text-slate-300">Worker sees the job sequence and records arrival on site.</p>
            </div>
            <div class="rounded-lg border border-white/12 bg-white/8 p-4 backdrop-blur">
              <p class="text-xs font-black uppercase tracking-wide text-teal-200">Proof</p>
              <p class="mt-2 text-sm font-black">Photos and receipts</p>
              <p class="mt-1 text-xs font-semibold leading-5 text-slate-300">Before, after, issue, purchase, and notes stay with the job.</p>
            </div>
            <div class="rounded-lg border border-white/12 bg-white/8 p-4 backdrop-blur">
              <p class="text-xs font-black uppercase tracking-wide text-amber-200">Closeout</p>
              <p class="mt-2 text-sm font-black">Maintenance record</p>
              <p class="mt-1 text-xs font-semibold leading-5 text-slate-300">Submit the clean record for operations review.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="relative flex min-h-dvh items-start justify-center overflow-hidden p-3 pt-6 sm:p-6 sm:pt-10 lg:items-center lg:bg-slate-950/8 lg:p-8 lg:backdrop-blur">
        <div aria-hidden="true" class="maple-leaf absolute -right-14 top-4 h-44 w-44 bg-teal-300/12"></div>
        <div aria-hidden="true" class="absolute -bottom-10 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-teal-950/20 blur-2xl"></div>
        <div aria-hidden="true" class="absolute bottom-5 left-6 h-16 w-16 -rotate-12 opacity-35">
          <span class="maple-leaf maple-leaf-wash block h-full w-full"></span>
        </div>
        <div aria-hidden="true" class="absolute bottom-12 right-8 h-11 w-11 rotate-12 opacity-25">
          <span class="maple-leaf block h-full w-full bg-amber-200"></span>
        </div>
        <div aria-hidden="true" class="absolute bottom-24 left-1/2 h-9 w-9 -translate-x-1/2 rotate-6 opacity-20">
          <span class="maple-leaf block h-full w-full bg-teal-200"></span>
        </div>

        <p-card styleClass="worker-login-card w-full max-w-[25rem] overflow-hidden border-0 shadow-2xl">
          <div class="rounded-t-2xl border border-white/10 bg-white/10 px-4 py-4 text-white shadow-2xl shadow-slate-950/25 backdrop-blur">
            <div class="flex items-center gap-3">
              <span class="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-200 text-teal-900 shadow-lg shadow-teal-950/20">
                <span class="maple-leaf h-7 w-7 bg-teal-900"></span>
              </span>
              <span>
                <span class="block text-base font-black leading-tight">Maple Property Services</span>
                <span class="block text-xs font-bold text-teal-100">Worker field pass</span>
              </span>
            </div>
            <div class="mt-5 rounded-xl border border-white/10 bg-slate-950/30 p-3">
              <p class="text-[0.68rem] font-black uppercase tracking-wide text-teal-200">Today flow</p>
              <div class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs font-bold">
                <span class="grid h-6 w-6 place-items-center rounded-full bg-teal-300 text-slate-950">1</span><span>Clock in before field actions</span>
                <span class="grid h-6 w-6 place-items-center rounded-full bg-teal-300 text-slate-950">2</span><span>Travel, arrive, work, capture proof</span>
                <span class="grid h-6 w-6 place-items-center rounded-full bg-amber-300 text-slate-950">3</span><span>Submit maintenance record</span>
              </div>
            </div>
          </div>

          <div class="space-y-5 rounded-b-2xl bg-white p-4 shadow-2xl shadow-slate-950/25 sm:p-5">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker access</p>
              <h1 class="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Sign in for today’s jobs</h1>
              <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">Open assigned work, clock travel and arrival, upload photos or receipts, and complete the day ticket.</p>
          </div>
          <form class="space-y-3.5" (ngSubmit)="login()">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
              <input pInputText class="h-12 w-full !text-base" name="email" autocomplete="username" [(ngModel)]="email" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Password</span>
              <p-password
                styleClass="w-full"
                inputStyleClass="w-full h-12 !text-base"
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
              class="w-full touch-action !border-teal-600 !bg-teal-600 !text-base hover:!border-teal-700 hover:!bg-teal-700"
              icon="pi pi-mobile"
              [disabled]="loading()"
              [loading]="loading()"
              label="Sign in"
            ></button>
          </form>
          <div class="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-[0.72rem] font-black text-slate-600">
            <span class="rounded-lg bg-slate-50 px-2 py-2">Jobs</span>
            <span class="rounded-lg bg-slate-50 px-2 py-2">Photos</span>
            <span class="rounded-lg bg-slate-50 px-2 py-2">Ticket</span>
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
      await this.auth.login({ email: this.email, password: this.password });
      await this.router.navigateByUrl('/today');
    } catch {
      this.error.set('Unable to sign in. Check credentials and backend status.');
    } finally {
      this.loading.set(false);
    }
  }
}
