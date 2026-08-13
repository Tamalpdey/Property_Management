import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { CurrentUser } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'lorne-tenant-shell',
  standalone: true,
  imports: [ButtonModule, NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[14.5rem_1fr]">
      <aside class="sticky top-0 hidden h-screen border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <ng-container *ngTemplateOutlet="sidebarContent" />
      </aside>

      @if (mobileMenuOpen()) {
        <div class="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm lg:hidden" (click)="mobileMenuOpen.set(false)"></div>
        <aside class="fixed inset-y-0 left-0 z-50 flex w-[19rem] max-w-[86vw] flex-col border-r border-slate-200 bg-white shadow-2xl lg:hidden">
          <ng-container *ngTemplateOutlet="sidebarContent" />
        </aside>
      }

      <div class="min-w-0">
        <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur">
          <div class="flex items-center justify-between gap-3 px-3 py-1.5 lg:px-3.5">
            <div class="flex min-w-0 items-center gap-2.5">
              <div class="lg:hidden">
                <button pButton type="button" severity="secondary" text rounded icon="pi pi-bars" (click)="mobileMenuOpen.set(true)"></button>
              </div>
              <div class="min-w-0">
                <p class="truncate text-[0.95rem] font-bold text-slate-950">{{ workspaceRoleLabel() }}</p>
                <p class="truncate text-xs font-semibold text-slate-500">Portfolio operations workspace</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="hidden items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-800 sm:flex">
                <i class="pi pi-check-circle"></i>
                Live operations
              </div>
              <button pButton type="button" severity="secondary" size="small" icon="pi pi-sign-out" label="Sign out" (click)="signOut()"></button>
            </div>
          </div>
        </header>

        <main class="w-full px-2.5 py-2.5 md:px-3 md:py-3">
          <router-outlet />
        </main>
      </div>
    </div>

    <ng-template #sidebarContent>
      <div class="flex h-full min-h-0 flex-col">
        <div class="border-b border-slate-200 px-2 py-2">
          <a routerLink="/dashboard" class="flex min-w-0 items-center gap-2.5 text-slate-950 no-underline" (click)="mobileMenuOpen.set(false)">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white shadow-sm shadow-slate-300">L</span>
            <span class="min-w-0">
              <span class="block truncate text-[0.92rem] font-bold leading-tight">Lorne PropertyOps</span>
              <span class="block truncate text-xs font-semibold text-slate-500">Tenant command center</span>
            </span>
          </a>
        </div>

        <nav class="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-2 py-3">
          @for (section of navSections(); track section.label) {
            <section>
              <p class="px-2.5 text-[0.66rem] font-bold uppercase tracking-wider text-slate-400">{{ section.label }}</p>
              <div class="mt-1.5 space-y-1">
                @for (item of section.items; track item.path) {
                  <a
                    [routerLink]="item.path"
                    routerLinkActive="border-teal-200 bg-teal-50 text-teal-800"
                    [routerLinkActiveOptions]="{ exact: true }"
                    class="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[0.92rem] font-semibold text-slate-600 no-underline transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                    (click)="mobileMenuOpen.set(false)"
                  >
                    <i [class]="item.icon + ' w-4 shrink-0 text-center'"></i>
                    <span class="truncate">{{ item.label }}</span>
                  </a>
                }
              </div>
            </section>
          }
        </nav>

        <div class="border-t border-slate-200 p-2">
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-2">
            <p class="text-xs font-bold text-slate-950">Next billing run</p>
            <p class="mt-1 text-xs font-semibold text-slate-500">Work, materials, taxes, approvals</p>
          </div>
        </div>
      </div>
    </ng-template>
  `
})
export class TenantShellComponent {
  private readonly auth = inject(AuthService);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly workspaceRoleLabel = computed(() => {
    const user = this.auth.currentUser();
    if (!user) {
      return 'Tenant workspace';
    }
    if (user.roles.includes('TENANT_ADMIN')) {
      return 'Tenant admin';
    }
    if (user.roles.includes('OPERATIONS')) {
      return 'Tenant operations';
    }
    if (user.roles.includes('FINANCE')) {
      return 'Tenant finance';
    }
    return 'Tenant workspace';
  });
  protected readonly navSections = computed(() => this.allNavSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => this.canAccess(item))
    }))
    .filter((section) => section.items.length > 0));
  private readonly allNavSections: TenantNavSection[] = [
    {
      label: 'Command',
      items: [
        { label: 'Dashboard', path: '/dashboard', icon: 'pi pi-chart-line' }
      ]
    },
    {
      label: 'Reports',
      items: [
        { label: 'Snapshot', path: '/reports', icon: 'pi pi-chart-bar' },
        { label: 'Report builder', path: '/reports/builder', icon: 'pi pi-file-export' },
        { label: 'Day ticket', path: '/reports/day-ticket', icon: 'pi pi-print' }
      ]
    },
    {
      label: 'Portfolio',
      items: [
        { label: 'Owners', path: '/owners', icon: 'pi pi-users' },
        { label: 'Properties', path: '/properties', icon: 'pi pi-building' },
        { label: 'Services', path: '/services', icon: 'pi pi-wrench' }
      ]
    },
    {
      label: 'Operations',
      items: [
        { label: 'Work orders', path: '/work-orders', icon: 'pi pi-calendar-plus' },
        { label: 'Schedule', path: '/schedule', icon: 'pi pi-calendar-clock' },
        { label: 'Inventory', path: '/inventory', icon: 'pi pi-box' },
        { label: 'Work audit', path: '/work-audit', icon: 'pi pi-history' }
      ]
    },
    {
      label: 'People',
      items: [
        { label: 'Workers', path: '/workers', icon: 'pi pi-id-card' },
        { label: 'Payroll', path: '/payroll', icon: 'pi pi-wallet', roles: ['TENANT_ADMIN', 'FINANCE'] }
      ]
    },
    {
      label: 'Finance',
      items: [
        { label: 'Finance overview', path: '/finance', icon: 'pi pi-dollar', roles: ['TENANT_ADMIN', 'FINANCE'] },
        { label: 'Invoices', path: '/invoices', icon: 'pi pi-file-edit' },
        { label: 'Payments', path: '/payments', icon: 'pi pi-credit-card', roles: ['TENANT_ADMIN', 'FINANCE'] }
      ]
    },
    {
      label: 'Administration',
      items: [
        { label: 'Users', path: '/users', icon: 'pi pi-user-edit', roles: ['TENANT_ADMIN'] },
        { label: 'Email templates', path: '/email-templates', icon: 'pi pi-envelope', roles: ['TENANT_ADMIN', 'FINANCE'] },
        { label: 'Settings', path: '/settings', icon: 'pi pi-cog', roles: ['TENANT_ADMIN'] }
      ]
    }
  ];

  private canAccess(item: TenantNavItem): boolean {
    return !item.roles || this.auth.hasAnyRole(item.roles);
  }

  signOut(): void {
    this.auth.signOut();
    location.assign('/login');
  }
}

interface TenantNavSection {
  label: string;
  items: TenantNavItem[];
}

interface TenantNavItem {
  label: string;
  path: string;
  icon: string;
  roles?: CurrentUser['roles'];
}
