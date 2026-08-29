import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, firstValueFrom, interval, of, startWith, switchMap } from 'rxjs';
import type { ConversationRecord, TenantSettingsRecord } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../core/services/auth.service';
import { WorkerCommunicationService } from '../features/messages/services/worker-communication.service';
import { WorkerJobService } from '../features/today/services/worker-job.service';
import { WorkerShiftClockComponent } from './worker-shift-clock.component';

@Component({
  selector: 'lorne-worker-shell',
  standalone: true,
  imports: [ButtonModule, RouterLink, RouterLinkActive, RouterOutlet, WorkerShiftClockComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 border-b border-slate-800 bg-slate-950 text-white shadow-lg shadow-slate-950/20">
        <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
          <a routerLink="/today" class="flex min-w-0 items-center gap-2.5 text-white no-underline sm:gap-3">
            <span class="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white p-1 text-xs font-black text-teal-900 shadow-lg shadow-teal-950/30 sm:h-11 sm:w-11">
              @if (brandLogoUrl()) {
                <img class="max-h-full max-w-full object-contain" [src]="brandLogoUrl()" [alt]="brandName() + ' logo'" />
              } @else {
                {{ brandInitials() }}
              }
            </span>
            <span>
              <span class="block max-w-[11rem] truncate text-sm font-black leading-tight sm:max-w-[18rem]">{{ brandName() }}</span>
              <span class="block text-xs font-semibold text-teal-100">Mobile field console</span>
              <span class="block max-w-[11rem] truncate text-[0.7rem] font-bold text-slate-300 sm:max-w-[18rem]">{{ userDisplayName() }}</span>
            </span>
          </a>
          <div class="flex shrink-0 items-center gap-2">
            <div class="hidden min-w-0 text-right sm:block">
              <p class="max-w-[10rem] truncate text-sm font-black leading-tight text-white">{{ userDisplayName() }}</p>
              <p class="text-[0.68rem] font-semibold text-slate-300">Worker login</p>
            </div>
            <span class="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-white/15 bg-slate-900 text-xs font-black text-teal-100">
              @if (userPhotoUrl()) {
                <img class="h-full w-full object-cover" [src]="userPhotoUrl()" [alt]="userDisplayName() + ' photo'" />
              } @else {
                {{ userInitials() }}
              }
            </span>
            <button pButton type="button" severity="secondary" size="small" icon="pi pi-sign-out" label="Sign out" class="shrink-0" (click)="signOut()"></button>
          </div>
        </div>
      </header>
      <lorne-worker-shift-clock />

      @if (latestUnreadAnnouncement(); as announcement) {
        <div class="border-b border-amber-200 bg-amber-50">
          <a routerLink="/messages" class="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 text-sm font-bold text-amber-950 no-underline sm:px-5">
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <i class="pi pi-megaphone"></i>
            </span>
            <span class="shrink-0 text-xs font-black uppercase tracking-wide text-amber-700">New announcement</span>
            <span class="min-w-0 flex-1 truncate">{{ announcement.lastMessagePreview || announcement.title || 'Open announcement' }}</span>
            <span class="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-black text-amber-700">{{ unreadAnnouncementLabel() }} unread</span>
          </a>
        </div>
      }

      <main class="relative mx-auto max-w-6xl px-3 py-3 pb-24 sm:px-5 sm:py-5 sm:pb-32">
        <router-outlet />
      </main>

      <nav class="fixed inset-x-0 bottom-0 z-30 border-t border-teal-100 bg-white/95 shadow-[0_-12px_30px_rgba(15,118,110,0.12)] backdrop-blur">
        <div class="mx-auto grid max-w-xl grid-cols-6 gap-1 px-1 py-1">
          <a routerLink="/today" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-calendar]="!loadingFor('/today')" [class.pi-spinner]="loadingFor('/today')" [class.pi-spin]="loadingFor('/today')"></i>
            Jobs
          </a>
          <a routerLink="/activity" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-stopwatch]="!loadingFor('/activity')" [class.pi-spinner]="loadingFor('/activity')" [class.pi-spin]="loadingFor('/activity')"></i>
            Activity
          </a>
          <a routerLink="/loadout" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-briefcase]="!loadingFor('/loadout')" [class.pi-spinner]="loadingFor('/loadout')" [class.pi-spin]="loadingFor('/loadout')"></i>
            Loadout
          </a>
          <a routerLink="/day-ticket" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-print]="!loadingFor('/day-ticket')" [class.pi-spinner]="loadingFor('/day-ticket')" [class.pi-spin]="loadingFor('/day-ticket')"></i>
            Ticket
          </a>
          <a routerLink="/messages" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action relative grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-comments]="!loadingFor('/messages')" [class.pi-spinner]="loadingFor('/messages')" [class.pi-spin]="loadingFor('/messages')"></i>
            @if (unreadMessageCount() > 0) {
              <span
                class="absolute right-1.5 top-1 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 py-0.5 text-[0.6rem] font-black leading-none text-white shadow-sm shadow-rose-200"
                [attr.aria-label]="unreadMessageCount() + ' unread messages'"
              >
                {{ unreadMessageLabel() }}
              </span>
            }
            Messages
          </a>
          <a routerLink="/guide" routerLinkActive="bg-teal-700 text-white shadow-lg shadow-teal-900/20" [routerLinkActiveOptions]="{ exact: true }" class="touch-action grid min-h-12 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-xs font-black text-slate-500 no-underline transition sm:gap-1 sm:py-2 sm:text-sm">
            <i class="pi" [class.pi-question-circle]="!loadingFor('/guide')" [class.pi-spinner]="loadingFor('/guide')" [class.pi-spin]="loadingFor('/guide')"></i>
            Guide
          </a>
        </div>
      </nav>

      @if (routeLoading()) {
        <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 px-6 backdrop-blur-sm" role="status" aria-live="polite" aria-busy="true">
          <div class="w-full max-w-xs overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-2xl shadow-slate-950/25">
            <div class="h-1 overflow-hidden bg-teal-50">
              <span class="block h-full w-1/2 animate-[workerRouteProgress_0.85s_ease-in-out_infinite] rounded-r-full bg-teal-500 shadow-lg shadow-teal-400/40"></span>
            </div>
            <div class="grid gap-3 px-5 py-5 text-center">
              <span class="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <i class="pi pi-spin pi-spinner text-xl"></i>
              </span>
              <span class="text-base font-black text-slate-950">Loading {{ loadingLabel() }}</span>
              <span class="text-sm font-semibold text-slate-600">Preparing the worker view...</span>
            </div>
          </div>
        </div>
      }
    </div>
    <style>
      @keyframes workerRouteProgress {
        0% {
          transform: translateX(-110%);
        }
        50% {
          transform: translateX(80%);
        }
        100% {
          transform: translateX(220%);
        }
      }
    </style>
  `
})
export class WorkerShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly communicationService = inject(WorkerCommunicationService);
  private readonly workerJobService = inject(WorkerJobService);
  protected readonly routeLoading = signal(false);
  protected readonly loadingUrl = signal('');
  protected readonly tenantSettings = signal<TenantSettingsRecord | null>(null);
  protected readonly unreadMessageCount = signal(0);
  protected readonly unreadAnnouncementCount = signal(0);
  protected readonly latestUnreadAnnouncement = signal<ConversationRecord | null>(null);
  protected readonly unreadMessageLabel = computed(() => {
    const count = this.unreadMessageCount();
    return count > 99 ? '99+' : String(count);
  });
  protected readonly unreadAnnouncementLabel = computed(() => {
    const count = this.unreadAnnouncementCount();
    return count > 99 ? '99+' : String(count);
  });
  protected readonly brandName = computed(() => {
    const settings = this.tenantSettings();
    return this.firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Maple Worker');
  });
  protected readonly brandLogoUrl = computed(() => this.tenantSettings()?.logoUrl || '');
  protected readonly brandInitials = computed(() => this.initials(this.brandName()));
  protected readonly userPhotoUrl = computed(() => this.auth.currentUser()?.profilePhotoUrl || '');
  protected readonly userDisplayName = computed(() => this.auth.currentUser()?.displayName || 'Worker');
  protected readonly userInitials = computed(() => this.initials(this.userDisplayName()));
  private readonly minimumLoaderMs = 450;
  private loadingStartedAt = 0;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private announcementNotificationPrimed = false;
  private readonly seenUnreadAnnouncementKeys = new Set<string>();

  constructor() {
    void this.loadTenantSettings();
    this.requestAnnouncementNotificationPermission();
    this.startUnreadMessagePolling();
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.clearHideTimer();
        this.loadingStartedAt = Date.now();
        this.loadingUrl.set(event.url);
        this.routeLoading.set(true);
        return;
      }

      if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
        this.finishRouteLoading();
      }
    });
  }

  signOut(): void {
    this.auth.signOut();
    location.assign('/login');
  }

  protected loadingFor(path: string): boolean {
    return this.routeLoading() && this.loadingUrl().startsWith(path);
  }

  protected loadingLabel(): string {
    const url = this.loadingUrl();
    if (url.startsWith('/activity')) {
      return 'Activity';
    }
    if (url.startsWith('/loadout')) {
      return 'Loadout';
    }
    if (url.startsWith('/day-ticket')) {
      return 'Ticket';
    }
    if (url.startsWith('/messages')) {
      return 'Messages';
    }
    if (url.startsWith('/guide')) {
      return 'Guide';
    }
    if (url.startsWith('/jobs/')) {
      return 'Job';
    }
    return 'Jobs';
  }

  private finishRouteLoading(): void {
    const elapsedMs = Date.now() - this.loadingStartedAt;
    const remainingMs = Math.max(0, this.minimumLoaderMs - elapsedMs);
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.routeLoading.set(false);
      this.loadingUrl.set('');
      this.hideTimer = null;
    }, remainingMs);
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private async loadTenantSettings(): Promise<void> {
    try {
      this.tenantSettings.set(await firstValueFrom(this.workerJobService.settings()));
    } catch {
      this.tenantSettings.set(null);
    }
  }

  private startUnreadMessagePolling(): void {
    interval(12000).pipe(
      startWith(0),
      switchMap(() => this.communicationService.list().pipe(
        catchError(() => of([] as ConversationRecord[]))
      )),
      takeUntilDestroyed()
    ).subscribe((conversations) => {
      this.unreadMessageCount.set(conversations.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0));
      const unreadAnnouncements = conversations.filter((conversation) =>
        conversation.channelType === 'ANNOUNCEMENT' && (conversation.unreadCount || 0) > 0
      );
      this.unreadAnnouncementCount.set(unreadAnnouncements.reduce((total, conversation) => total + (conversation.unreadCount || 0), 0));
      this.latestUnreadAnnouncement.set(unreadAnnouncements[0] ?? null);
      this.notifyUnreadAnnouncements(conversations);
    });
  }

  private requestAnnouncementNotificationPermission(): void {
    if (!('Notification' in window) || Notification.permission !== 'default') {
      return;
    }
    void Notification.requestPermission();
  }

  private notifyUnreadAnnouncements(conversations: ConversationRecord[]): void {
    const unreadAnnouncements = conversations.filter((conversation) =>
      conversation.channelType === 'ANNOUNCEMENT' && (conversation.unreadCount || 0) > 0
    );
    if (!this.announcementNotificationPrimed) {
      unreadAnnouncements.forEach((conversation) => this.seenUnreadAnnouncementKeys.add(this.announcementNotificationKey(conversation)));
      this.announcementNotificationPrimed = true;
      return;
    }
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      unreadAnnouncements.forEach((conversation) => this.seenUnreadAnnouncementKeys.add(this.announcementNotificationKey(conversation)));
      return;
    }
    for (const conversation of unreadAnnouncements) {
      const key = this.announcementNotificationKey(conversation);
      if (this.seenUnreadAnnouncementKeys.has(key)) {
        continue;
      }
      this.seenUnreadAnnouncementKeys.add(key);
      new Notification(`${this.brandName()} announcement`, {
        body: conversation.lastMessagePreview || conversation.title || 'A new announcement was posted.',
        tag: `lorne-announcement-${conversation.id}`
      });
    }
  }

  private announcementNotificationKey(conversation: ConversationRecord): string {
    return `${conversation.id}:${conversation.lastMessageAt || ''}:${conversation.unreadCount || 0}`;
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
      .join('') || 'L';
  }
}
