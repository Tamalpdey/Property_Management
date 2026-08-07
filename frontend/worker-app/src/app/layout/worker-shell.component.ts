import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../core/services/auth.service';
import { WorkerShiftClockComponent } from './worker-shift-clock.component';

@Component({
  selector: 'lorne-worker-shell',
  standalone: true,
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet, WorkerShiftClockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <a routerLink="/today" class="flex min-w-0 items-center gap-3 text-white no-underline">
            <span class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-teal-400 font-black text-slate-950 shadow-lg shadow-teal-950/30">L</span>
            <span>
              <span class="block text-sm font-black leading-tight">Lorne Worker</span>
              <span class="block text-xs font-semibold text-teal-100">Mobile field console</span>
            </span>
          </a>
          <button pButton type="button" severity="secondary" size="small" icon="pi pi-sign-out" label="Sign out" (click)="signOut()"></button>
        </div>
      </header>
      <lorne-worker-shift-clock />

      <main class="mx-auto max-w-6xl px-3 py-3 pb-32 sm:px-5 sm:py-5">
        <router-outlet />
      </main>

      <nav class="fixed inset-x-0 bottom-0 z-30 grid border-t border-teal-100 bg-white/95 shadow-[0_-12px_30px_rgba(15,118,110,0.12)] backdrop-blur">
        <a routerLink="/today" routerLinkActive="text-teal-700" class="touch-action grid place-items-center gap-1 py-2 text-sm font-bold text-slate-500 no-underline">
          <i class="pi pi-calendar"></i>
          Jobs
        </a>
      </nav>
    </div>
  `
})
export class WorkerShellComponent {
  private readonly auth = inject(AuthService);

  signOut(): void {
    this.auth.signOut();
    location.assign('/login');
  }
}
