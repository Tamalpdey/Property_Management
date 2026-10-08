import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'lorne-admin-shell',
  standalone: true,
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-50 md:grid md:grid-cols-[17rem_1fr]">
      <aside class="hidden border-r border-slate-800 bg-slate-950 p-4 text-white md:block">
        <a routerLink="/dashboard" class="flex items-center gap-3 text-white no-underline">
          <span class="grid h-11 w-11 place-items-center rounded-lg bg-white font-bold text-slate-950">L</span>
          <span>
            <span class="block text-sm font-bold">Lorne Admin</span>
            <span class="block text-xs font-medium text-slate-400">Platform controls</span>
          </span>
        </a>
        <nav class="mt-8 space-y-1">
          <a routerLink="/dashboard" routerLinkActive="bg-white text-slate-950" class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-300 no-underline hover:bg-white/10"><i class="pi pi-chart-bar"></i> Dashboard</a>
          <a routerLink="/tenants" routerLinkActive="bg-white text-slate-950" class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-slate-300 no-underline hover:bg-white/10"><i class="pi pi-building"></i> Tenants</a>
          <span class="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-500">Plans</span>
          <span class="block rounded-lg px-3 py-2 text-sm font-semibold text-slate-500">Audit</span>
        </nav>
        <div class="mt-8 rounded-lg border border-slate-800 bg-white/5 p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-slate-400">Runtime</p>
          <p class="mt-2 text-sm font-bold">Spring Modulith</p>
          <p class="mt-1 text-xs leading-5 text-slate-400">Tenant isolation, audit, worker activity, and platform health.</p>
        </div>
      </aside>

      <main>
        <header class="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
          <nav class="flex items-center gap-1 md:hidden" aria-label="Admin navigation">
            <a routerLink="/dashboard" routerLinkActive="bg-slate-950 text-white" class="rounded px-3 py-2 text-sm font-bold text-slate-600 no-underline">Dashboard</a>
            <a routerLink="/tenants" routerLinkActive="bg-slate-950 text-white" class="rounded px-3 py-2 text-sm font-bold text-slate-600 no-underline">Tenants</a>
          </nav>
          <span class="hidden text-sm font-semibold text-slate-500 md:inline">Platform administration</span>
          <button pButton type="button" severity="secondary" size="small" icon="pi pi-sign-out" label="Sign out" (click)="signOut()"></button>
        </header>
        <div class="p-4 md:p-8">
          <router-outlet />
        </div>
      </main>
    </div>
  `
})
export class AdminShellComponent {
  private readonly auth = inject(AuthService);

  signOut(): void {
    this.auth.signOut();
    location.assign('/login');
  }
}
