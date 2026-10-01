import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, firstValueFrom, interval, map, of, startWith, switchMap } from 'rxjs';
import type { CurrentUser, TenantSettingsRecord } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../core/services/auth.service';
import { CommunicationService } from '../features/messages/services/communication.service';
import { TenantSettingsService } from '../features/settings/services/tenant-settings.service';

@Component({
  selector: 'lorne-tenant-shell',
  standalone: true,
  imports: [ButtonModule, NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-slate-100 lg:grid lg:grid-cols-[17rem_1fr]">
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
              <span class="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-200 bg-teal-50 text-xs font-black text-teal-800">
                @if (userPhotoUrl()) {
                  <img class="h-full w-full object-cover" [src]="userPhotoUrl()" [alt]="userDisplayName() + ' photo'" />
                } @else {
                  {{ userInitials() }}
                }
              </span>
              <div class="min-w-0">
                <p class="truncate text-[0.95rem] font-bold text-slate-950">{{ userDisplayName() }} logged in as {{ userRoleLabel() }}</p>
                <p class="truncate text-xs font-semibold text-slate-500">Operations workspace</p>
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
        <div class="border-b border-slate-200 px-2.5 py-2.5">
          <a routerLink="/dashboard" class="flex min-w-0 items-center gap-3 text-slate-950 no-underline" (click)="mobileMenuOpen.set(false)">
            <span class="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 text-sm font-black text-teal-800 shadow-sm shadow-slate-300">
              @if (brandLogoUrl()) {
                <img class="max-h-full max-w-full object-contain" [src]="brandLogoUrl()" [alt]="brandName() + ' logo'" />
              } @else {
                {{ brandInitials() }}
              }
            </span>
            <span class="min-w-0">
              <span class="block whitespace-normal break-words text-[0.92rem] font-bold leading-tight">{{ brandName() }}</span>
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
                    routerLinkActive="border-teal-500 bg-teal-600 text-white shadow-sm shadow-teal-200"
                    [routerLinkActiveOptions]="{ exact: true }"
                    class="flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-2 text-[0.92rem] font-semibold text-slate-600 no-underline transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                    (click)="mobileMenuOpen.set(false)"
                  >
                    <i [class]="item.icon + ' w-4 shrink-0 text-center'"></i>
                    <span class="truncate">{{ item.label }}</span>
                    @if (item.path === '/messages' && unreadMessageCount() > 0) {
                      <span
                        class="ml-auto grid min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[0.65rem] font-black leading-none text-white shadow-sm shadow-rose-200"
                        [attr.aria-label]="unreadMessageCount() + ' unread messages'"
                      >
                        {{ unreadMessageLabel() }}
                      </span>
                    }
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
  private readonly communicationService = inject(CommunicationService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly tenantSettings = signal<TenantSettingsRecord | null>(null);
  protected readonly unreadMessageCount = signal(0);
  protected readonly unreadMessageLabel = computed(() => {
    const count = this.unreadMessageCount();
    return count > 99 ? '99+' : String(count);
  });
  protected readonly brandName = computed(() => {
    const settings = this.tenantSettings();
    return this.firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'PropertyOps');
  });
  protected readonly brandLogoUrl = computed(() => this.tenantSettings()?.logoUrl || '');
  protected readonly brandInitials = computed(() => this.initials(this.brandName()));
  protected readonly userDisplayName = computed(() => this.displayName(this.auth.currentUser()));
  protected readonly userPhotoUrl = computed(() => this.auth.currentUser()?.profilePhotoUrl || '');
  protected readonly userInitials = computed(() => this.initials(this.userDisplayName()));
  protected readonly userRoleLabel = computed(() => {
    const user = this.auth.currentUser();
    if (!user) {
      return 'Workspace';
    }
    if (user.roles.includes('TENANT_ADMIN')) {
      return 'Admin';
    }
    if (user.roles.includes('OPERATIONS')) {
      return 'Operations';
    }
    if (user.roles.includes('FINANCE')) {
      return 'Finance';
    }
    return 'Workspace';
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
        { label: 'Route intelligence', path: '/route-intelligence', icon: 'pi pi-map' },
        { label: 'Messages', path: '/messages', icon: 'pi pi-comments' },
        { label: 'Inventory', path: '/inventory', icon: 'pi pi-box' },
        { label: 'Work audit', path: '/work-audit', icon: 'pi pi-history' }
      ]
    },
    {
      label: 'People',
      items: [
        { label: 'Workers', path: '/workers', icon: 'pi pi-id-card' },
        { label: 'Timesheets', path: '/payroll', icon: 'pi pi-clock', roles: ['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'] }
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
        { label: 'Email audit', path: '/email-audit', icon: 'pi pi-send', roles: ['TENANT_ADMIN', 'OPERATIONS', 'FINANCE'] },
        { label: 'Settings', path: '/settings', icon: 'pi pi-cog', roles: ['TENANT_ADMIN'] }
      ]
    }
  ];

  constructor() {
    void this.loadTenantSettings();
    this.startUnreadMessagePolling();
  }

  private async loadTenantSettings(): Promise<void> {
    try {
      this.tenantSettings.set(await firstValueFrom(this.tenantSettingsService.get()));
    } catch {
      this.tenantSettings.set(null);
    }
  }

  private startUnreadMessagePolling(): void {
    interval(12000).pipe(
      startWith(0),
      switchMap(() => this.communicationService.list().pipe(
        map((conversations) => conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0)),
        catchError(() => of(0))
      )),
      takeUntilDestroyed()
    ).subscribe((count) => this.unreadMessageCount.set(count));
  }

  private canAccess(item: TenantNavItem): boolean {
    return !item.roles || this.auth.hasAnyRole(item.roles);
  }

  signOut(): void {
    this.auth.signOut();
    location.assign('/login');
  }

  private firstNonBlank(...values: Array<string | undefined | null>): string {
    return values.map((value) => value?.trim()).find(Boolean) || '';
  }

  private initials(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'P';
  }

  private displayName(user: CurrentUser | null): string {
    if (!user) {
      return 'User';
    }
    const name = user.displayName?.trim();
    if (name && !/^tenant\s+(admin|operations|finance|workspace)$/i.test(name)) {
      return name;
    }
    const emailName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    return emailName ? this.titleCase(emailName) : 'User';
  }

  private titleCase(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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
