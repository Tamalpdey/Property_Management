import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import type { WorkerActivity, WorkerDailyLoadout } from '@lorne/contracts';
import { WorkerShiftClockService } from '../../core/services/worker-shift-clock.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import { parseDateInput, toDateInput, workerErrorMessage } from '../today/worker-job-ui';

@Component({
  selector: 'lorne-worker-activity',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-teal-950/15">
        <div class="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-md bg-teal-300 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-950">Worker activity</span>
              <span class="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold text-teal-50">{{ selectedDateLabel() }}</span>
            </div>
            <h1 class="mt-2 text-2xl font-black leading-tight sm:text-4xl">Office, supplier, and shop time</h1>
            <p class="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
              Track time away from a property job. These rows print on the Day Ticket and are visible to operations.
            </p>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
        <div class="grid grid-cols-4 border-t border-white/10 bg-white/[0.04]">
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Activities</span>
            <span class="mt-0.5 block text-xl font-black">{{ activities().length }}</span>
          </div>
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Active</span>
            <span class="mt-0.5 block text-xl font-black">{{ openActivity() ? 1 : 0 }}</span>
          </div>
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Completed</span>
            <span class="mt-0.5 block text-xl font-black">{{ completedCount() }}</span>
          </div>
          <div class="px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Total</span>
            <span class="mt-0.5 block text-xl font-black">{{ durationLabel(totalMinutes()) }}</span>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }

      @if (!clock.clockedIn()) {
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Clock in before starting or ending an activity. You can still review past activity.
        </p>
      }

      <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
        <div class="grid gap-2 md:grid-cols-[12rem_1fr_auto] md:items-end">
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Date
            <input type="date" class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="selectedDate" (change)="load()" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Search
            <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Search activity, location, notes" [(ngModel)]="search" />
          </label>
          @if (openActivity(); as activity) {
            <button
              pButton
              type="button"
              severity="danger"
              icon="pi pi-stop-circle"
              label="End activity"
              [disabled]="!clock.clockedIn() || !!busyKey()"
              [loading]="busyKey() === activityKey(activity, 'END')"
              (click)="openEndActivityDialog(activity)"
            ></button>
          } @else {
            <button
              pButton
              type="button"
              icon="pi pi-play"
              label="Start activity"
              [disabled]="!clock.clockedIn() || !!busyKey()"
              [loading]="busyKey() === 'activity-start'"
              (click)="openStartActivityDialog()"
            ></button>
          }
        </div>
      </section>

      @if (openActivity(); as activity) {
        <article class="rounded-lg border border-teal-200 bg-teal-50 p-3 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ activityLabel(activity.activityType) }}</p>
              <h2 class="text-xl font-black text-slate-950">{{ activity.title }}</h2>
              @if (activity.locationName || activity.address) {
                <p class="mt-1 text-sm font-bold text-slate-600">{{ activity.locationName }}{{ activity.locationName && activity.address ? ' · ' : '' }}{{ activity.address }}</p>
              }
              @if (activity.notes) {
                <p class="mt-2 whitespace-pre-wrap text-sm font-semibold text-slate-700">{{ activity.notes }}</p>
              }
            </div>
            <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-teal-800">Started {{ activity.startedAt | date:'MMM d, h:mm a' }}</span>
          </div>
        </article>
      }

      <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Activity log</p>
            <h2 class="text-xl font-black text-slate-950">{{ filteredActivities().length }} visible rows</h2>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ selectedDate }}</span>
        </div>
        <div class="mt-3 grid gap-2 md:grid-cols-2">
          @for (activity of filteredActivities(); track activity.id) {
            <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ activityLabel(activity.activityType) }}</p>
                  <h3 class="truncate text-lg font-black text-slate-950">{{ activity.title }}</h3>
                  @if (activity.locationName || activity.address) {
                    <p class="mt-1 text-sm font-bold text-slate-600">{{ activity.locationName }}{{ activity.locationName && activity.address ? ' · ' : '' }}{{ activity.address }}</p>
                  }
                </div>
                <span class="rounded-full px-2.5 py-1 text-xs font-black uppercase" [class]="activity.open ? 'bg-teal-100 text-teal-800' : 'bg-slate-200 text-slate-700'">
                  {{ activity.open ? 'Active' : durationLabel(activity.durationMinutes) }}
                </span>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 rounded-md bg-white p-2 text-xs font-bold text-slate-600">
                <span>Started <strong class="block text-slate-950">{{ activity.startedAt | date:'MMM d, h:mm a' }}</strong></span>
                <span>Ended <strong class="block text-slate-950">{{ activity.endedAt ? (activity.endedAt | date:'MMM d, h:mm a') : 'Active' }}</strong></span>
              </div>
              @if (activity.notes) {
                <p class="mt-2 whitespace-pre-wrap rounded-md border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700">{{ activity.notes }}</p>
              }
            </article>
          } @empty {
            <div class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500 md:col-span-2">
              No worker activity for this date.
            </div>
          }
        </div>
      </section>

      <p-dialog
        [(visible)]="activityDialogVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: 'min(92vw, 30rem)' }"
        [contentStyle]="{ padding: '0' }"
        (onHide)="resetActivityDialog()"
      >
        <ng-template pTemplate="header">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker activity</p>
            <h2 class="text-lg font-black text-slate-950">{{ activityDialogMode === 'START' ? 'Start activity' : 'End activity' }}</h2>
          </div>
        </ng-template>

        <form class="grid gap-3 p-4" (ngSubmit)="submitActivityDialog()">
          @if (activityDialogError()) {
            <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ activityDialogError() }}</p>
          }

          @if (activityDialogMode === 'START') {
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Activity type
              <select class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" name="activityType" [(ngModel)]="activityForm.activityType" (ngModelChange)="syncDefaultActivityTitle()">
                <option value="OFFICE">Office visit</option>
                <option value="SUPPLIER">Supplier stop</option>
                <option value="SHOP">Shop work</option>
                <option value="WAREHOUSE">Warehouse stop</option>
                <option value="TRAVEL">Travel</option>
                <option value="BREAK">Break</option>
                <option value="OTHER">Other activity</option>
              </select>
            </label>
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Activity title <span class="text-red-600">*</span>
              <input class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" name="activityTitle" required placeholder="Example: Pick up chemicals" [(ngModel)]="activityForm.title" />
            </label>
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Location name
              <input class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" name="activityLocationName" placeholder="Office, supplier, warehouse" [(ngModel)]="activityForm.locationName" />
            </label>
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Address
              <input class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" name="activityAddress" placeholder="Optional address" [(ngModel)]="activityForm.address" />
            </label>
          } @else if (selectedActivity) {
            <div class="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ activityLabel(selectedActivity.activityType) }}</p>
              <p class="text-base font-black text-slate-950">{{ selectedActivity.title }}</p>
              <p class="text-xs font-bold text-slate-600">Started {{ selectedActivity.startedAt | date:'MMM d, h:mm a' }}</p>
            </div>
          }

          <label class="grid gap-1 text-sm font-bold text-slate-700">
            {{ activityDialogMode === 'START' ? 'Start notes' : 'End notes' }}
            <textarea class="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800" name="activityNotes" placeholder="Optional notes for dispatch and Day Ticket" [(ngModel)]="activityForm.notes"></textarea>
          </label>

          <div class="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closeActivityDialog()"></button>
            <button
              pButton
              type="submit"
              [severity]="activityDialogMode === 'START' ? 'success' : 'danger'"
              [icon]="activityDialogMode === 'START' ? 'pi pi-play' : 'pi pi-stop-circle'"
              [label]="activityDialogMode === 'START' ? 'Start' : 'End'"
              [disabled]="activityDialogMode === 'START' && !activityForm.title.trim()"
              [loading]="busyKey() === 'activity-start' || (selectedActivity ? busyKey() === activityKey(selectedActivity, 'END') : false)"
            ></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class WorkerActivityComponent {
  private readonly workerJobService = inject(WorkerJobService);
  protected readonly clock = inject(WorkerShiftClockService);

  protected readonly loadout = signal<WorkerDailyLoadout | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly busyKey = signal('');
  protected selectedDate = toDateInput(new Date());
  protected search = '';
  protected activityDialogVisible = false;
  protected activityDialogMode: 'START' | 'END' = 'START';
  protected selectedActivity: WorkerActivity | null = null;
  protected readonly activityDialogError = signal('');
  protected activityForm = this.defaultActivityForm('OFFICE');

  protected readonly activities = computed(() => this.loadout()?.activities ?? []);
  protected readonly openActivity = computed(() => this.activities().find((activity) => activity.open));
  protected readonly filteredActivities = computed(() => {
    const search = this.search.trim().toLowerCase();
    if (!search) {
      return this.activities();
    }
    return this.activities().filter((activity) => [
      activity.activityType,
      activity.title,
      activity.locationName,
      activity.address,
      activity.notes
    ].some((value) => value?.toLowerCase().includes(search)));
  });
  protected readonly completedCount = computed(() => this.activities().filter((activity) => !activity.open).length);
  protected readonly totalMinutes = computed(() => this.activities().reduce((total, activity) => {
    if (activity.open) {
      return total + minutesBetween(activity.startedAt, new Date().toISOString());
    }
    return total + (activity.durationMinutes ?? minutesBetween(activity.startedAt, activity.endedAt));
  }, 0));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.loadout(this.selectedDate)));
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load worker activity. Try again or contact dispatch.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected openStartActivityDialog(): void {
    this.activityDialogError.set('');
    this.activityDialogMode = 'START';
    this.selectedActivity = null;
    this.activityForm = this.defaultActivityForm('OFFICE');
    this.activityDialogVisible = true;
  }

  protected openEndActivityDialog(activity: WorkerActivity): void {
    this.activityDialogError.set('');
    this.activityDialogMode = 'END';
    this.selectedActivity = activity;
    this.activityForm = {
      activityType: activity.activityType || 'OTHER',
      title: activity.title || this.defaultActivityTitle(activity.activityType),
      locationName: activity.locationName || '',
      address: activity.address || '',
      notes: activity.notes || ''
    };
    this.activityDialogVisible = true;
  }

  protected closeActivityDialog(): void {
    this.activityDialogVisible = false;
  }

  protected resetActivityDialog(): void {
    if (!this.activityDialogVisible) {
      this.selectedActivity = null;
      this.activityDialogError.set('');
      this.activityForm = this.defaultActivityForm('OFFICE');
      this.activityDialogMode = 'START';
    }
  }

  protected syncDefaultActivityTitle(): void {
    const currentTitle = this.activityForm.title.trim();
    const knownTitles = ['Office visit', 'Supplier stop', 'Shop work', 'Warehouse stop', 'Travel', 'Break', 'Other activity'];
    if (!currentTitle || knownTitles.includes(currentTitle)) {
      this.activityForm.title = this.defaultActivityTitle(this.activityForm.activityType);
    }
  }

  protected async submitActivityDialog(): Promise<void> {
    if (this.activityDialogMode === 'START') {
      await this.startActivity();
      return;
    }
    if (this.selectedActivity) {
      await this.endActivity(this.selectedActivity);
    }
  }

  protected selectedDateLabel(): string {
    return parseDateInput(this.selectedDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  protected activityKey(activity: WorkerActivity, action: string): string {
    return `${activity.id}-${action}`;
  }

  protected activityLabel(value: string): string {
    return value.replaceAll('_', ' ').toLowerCase();
  }

  protected durationLabel(minutes?: number): string {
    if (!minutes) {
      return '0m';
    }
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  private async startActivity(): Promise<void> {
    if (!this.clock.clockedIn() || this.busyKey()) {
      return;
    }
    const activityType = this.activityForm.activityType || 'OFFICE';
    const title = this.activityForm.title.trim() || this.defaultActivityTitle(activityType);
    this.busyKey.set('activity-start');
    this.error.set('');
    this.activityDialogError.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.startActivity(this.selectedDate, {
        activityType,
        title,
        locationName: this.activityForm.locationName.trim(),
        address: this.activityForm.address.trim(),
        notes: this.activityForm.notes.trim()
      })));
      this.closeActivityDialog();
    } catch (error) {
      const message = workerErrorMessage(error, 'Unable to start worker activity. Clock in and try again.');
      if (this.activityDialogVisible) {
        this.activityDialogError.set(message);
      } else {
        this.error.set(message);
      }
    } finally {
      this.busyKey.set('');
    }
  }

  private async endActivity(activity: WorkerActivity): Promise<void> {
    if (!this.clock.clockedIn() || this.busyKey()) {
      return;
    }
    this.busyKey.set(this.activityKey(activity, 'END'));
    this.error.set('');
    this.activityDialogError.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.endActivity(this.selectedDate, activity.id, {
        notes: this.activityForm.notes.trim()
      })));
      this.closeActivityDialog();
    } catch (error) {
      const message = workerErrorMessage(error, 'Unable to end worker activity. Try again or contact dispatch.');
      if (this.activityDialogVisible) {
        this.activityDialogError.set(message);
      } else {
        this.error.set(message);
      }
    } finally {
      this.busyKey.set('');
    }
  }

  private defaultActivityTitle(activityType: string): string {
    switch (activityType.trim().toUpperCase()) {
      case 'SUPPLIER':
        return 'Supplier stop';
      case 'SHOP':
        return 'Shop work';
      case 'WAREHOUSE':
        return 'Warehouse stop';
      case 'TRAVEL':
        return 'Travel';
      case 'BREAK':
        return 'Break';
      case 'OTHER':
        return 'Other activity';
      default:
        return 'Office visit';
    }
  }

  private defaultActivityForm(activityType: string) {
    return {
      activityType,
      title: this.defaultActivityTitle(activityType),
      locationName: '',
      address: '',
      notes: ''
    };
  }
}

function minutesBetween(start?: string, end?: string): number {
  if (!start || !end) {
    return 0;
  }
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? Math.round(diff / 60000) : 0;
}
