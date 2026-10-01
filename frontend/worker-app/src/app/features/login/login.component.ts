import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../../core/services/auth.service';

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

    .field-panel {
      background:
        linear-gradient(rgba(15, 118, 110, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(15, 118, 110, 0.08) 1px, transparent 1px),
        linear-gradient(145deg, #f1faf7 0%, #e8f6f2 48%, #f8fafc 100%);
      background-size: 34px 34px, 34px 34px, auto;
    }

    .maple-leaf {
      clip-path: polygon(50% 0, 58% 19%, 78% 8%, 72% 31%, 96% 31%, 76% 47%, 86% 70%, 60% 61%, 56% 90%, 50% 72%, 44% 90%, 40% 61%, 14% 70%, 24% 47%, 4% 31%, 28% 31%, 22% 8%, 42% 19%);
    }

  `],
  template: `
    <main class="worker-login grid min-h-dvh place-items-center overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
      <section class="w-full max-w-5xl">
        <header class="mb-5 flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-100 text-teal-800 ring-1 ring-teal-200">
              <span class="maple-leaf h-6 w-6 bg-teal-700"></span>
            </span>
            <span>
              <span class="block text-sm font-black text-slate-950">Maple Property Services</span>
              <span class="block text-xs font-bold text-slate-500">Worker field console</span>
            </span>
          </div>
          <span class="hidden rounded-full border border-teal-100 bg-white/70 px-3 py-1 text-xs font-black text-teal-700 shadow-sm sm:inline-flex">
            mobile access
          </span>
        </header>

        <div class="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80 lg:grid-cols-[0.95fr_1.05fr]">
          <section class="grid place-items-center bg-white p-5 sm:p-8">
            <div class="w-full max-w-sm rounded-xl border border-teal-100 bg-white p-5 shadow-lg shadow-slate-200/70 sm:p-6">
              <div class="space-y-5">
                <div>
                  <p class="text-xs font-black uppercase text-teal-700">Worker access</p>
                  <h1 class="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">Start the field day</h1>
                  <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Sign in to view assigned jobs, clock time, capture proof, and submit the day ticket.
                  </p>
                </div>

                <form class="space-y-4" (ngSubmit)="login()">
                  <label class="block">
                    <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
                    <input pInputText class="h-11 w-full !text-base" name="email" autocomplete="username" [(ngModel)]="email" />
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

                <div class="grid grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-center text-xs font-black text-slate-500">
                  <span>Jobs</span>
                  <span>Photos</span>
                  <span>Ticket</span>
                </div>
              </div>
            </div>
          </section>

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
        </div>
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
