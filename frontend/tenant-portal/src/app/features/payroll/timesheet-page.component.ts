import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import type { WorkerClockEntryRecord, WorkerRecord } from '@lorne/contracts';
import { AuthService } from '../../core/services/auth.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';

interface TimesheetDayRow {
  date: string;
  entries: WorkerClockEntryRecord[];
  firstClockIn?: string;
  lastClockOut?: string;
  grossMinutes: number;
  pauseMinutes: number;
  netMinutes: number;
  openSessions: number;
  adjustedSessions: number;
}

@Component({
  selector: 'lorne-timesheet-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, SelectModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p-tag value="People" severity="success" />
              <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Timesheets</h1>
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ dayRows().length }} days</span>
            </div>
            <p class="mt-1 text-sm font-semibold text-slate-600">
              Review worker shift clock-in/out, breaks, and net payable time.
            </p>
          </div>
          <div class="grid gap-2 sm:grid-cols-[minmax(14rem,20rem)_9rem_9rem_auto_auto_auto]">
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Worker
              <p-select
                styleClass="w-full"
                [options]="workers()"
                optionLabel="displayName"
                optionValue="id"
                filterBy="displayName,email,employeeNumber,phone"
                [filter]="true"
                [showClear]="true"
                appendTo="body"
                placeholder="Search worker"
                [(ngModel)]="selectedWorkerId"
                (ngModelChange)="onWorkerSelected()"
              >
                <ng-template pTemplate="item" let-worker>
                  <div>
                    <p class="font-bold text-slate-900">{{ worker.displayName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ worker.employeeNumber || worker.email || worker.phone || 'Worker' }}</p>
                  </div>
                </ng-template>
                <ng-template pTemplate="selectedItem" let-worker>
                  <span>{{ worker?.displayName || 'Search worker' }}</span>
                </ng-template>
              </p-select>
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              From
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [(ngModel)]="fromDate" />
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              To
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [(ngModel)]="toDate" />
            </label>
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Load" [disabled]="!selectedWorkerId" [loading]="loading()" (click)="loadEntries()"></button>
            <button pButton type="button" severity="secondary" icon="pi pi-download" label="Export days" [disabled]="!selectedWorkerId || !entries().length" (click)="exportTimesheetCsv()"></button>
            <button pButton type="button" severity="secondary" icon="pi pi-list" label="Export sessions" [disabled]="!selectedWorkerId || !entries().length" (click)="exportSessionCsv()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }
      @if (selectedWorkerId && !activeWageRate()) {
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          Wage is $0.00 because this worker has no hourly rate. Save the permanent rate from Workers -> Edit worker -> Profile -> Hourly rate.
        </p>
      }

      <div class="grid gap-3 md:grid-cols-5">
        <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Gross time</p>
          <p class="mt-1 text-2xl font-black text-slate-950">{{ minutesLabel(grossMinutes()) }}</p>
          <p class="text-xs font-semibold text-slate-500">Clock-out minus clock-in</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Breaks</p>
          <p class="mt-1 text-2xl font-black text-amber-700">{{ minutesLabel(pauseMinutes()) }}</p>
          <p class="text-xs font-semibold text-slate-500">Captured shift pauses</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Net time</p>
          <p class="mt-1 text-2xl font-black text-teal-700">{{ minutesLabel(netMinutes()) }}</p>
          <p class="text-xs font-semibold text-slate-500">Gross minus breaks</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Open sessions</p>
          <p class="mt-1 text-2xl font-black text-slate-950">{{ openEntryCount() }}</p>
          <p class="text-xs font-semibold text-slate-500">Missing clock-out</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Estimated wage</p>
          <p class="mt-1 text-2xl font-black text-teal-700">{{ money(estimatedWage()) }}</p>
          <p class="text-xs font-semibold text-slate-500">{{ activeWageRate() ? money(activeWageRate()) + '/hr' : 'No hourly rate' }}</p>
        </article>
      </div>

      <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker timesheet</p>
            <h2 class="text-base font-black text-slate-950">{{ selectedWorker()?.displayName || 'No worker selected' }}</h2>
            <p class="mt-1 text-xs font-semibold text-slate-500">One row per day. Expand a day to review or adjust each captured session.</p>
          </div>
          @if (!canAdjust()) {
            <p class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Read-only for finance users</p>
          }
        </div>

        @if (loading()) {
          <div class="grid min-h-60 place-items-center">
            <div class="text-center">
              <i class="pi pi-spin pi-spinner text-3xl text-teal-600"></i>
              <p class="mt-3 text-sm font-bold text-slate-700">Loading timesheet...</p>
            </div>
          </div>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[68rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Date</th>
                  <th class="px-3 py-2">First clock in</th>
                  <th class="px-3 py-2">Last clock out</th>
                  <th class="px-3 py-2">Gross</th>
                  <th class="px-3 py-2">Break</th>
                  <th class="px-3 py-2">Net</th>
                  <th class="px-3 py-2">Wage</th>
                  <th class="px-3 py-2">Audit</th>
                  <th class="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (day of dayRows(); track day.date) {
                  <tr>
                    <td class="px-3 py-2 font-bold text-slate-700">{{ dateLabel(day.date) }}</td>
                    <td class="px-3 py-2 font-semibold text-slate-700">{{ day.firstClockIn ? (day.firstClockIn | date:'h:mm a') : '-' }}</td>
                    <td class="px-3 py-2">
                      @if (day.openSessions) {
                        <p-tag value="open" severity="warn" />
                      } @else {
                        <span class="font-semibold text-slate-700">{{ day.lastClockOut ? (day.lastClockOut | date:'h:mm a') : '-' }}</span>
                      }
                    </td>
                    <td class="px-3 py-2 font-black text-slate-800">{{ minutesLabel(day.grossMinutes) }}</td>
                    <td class="px-3 py-2 font-black text-amber-700">{{ minutesLabel(day.pauseMinutes) }}</td>
                    <td class="px-3 py-2 font-black text-teal-700">{{ minutesLabel(day.netMinutes) }}</td>
                    <td class="px-3 py-2 font-black text-slate-800">{{ money(dayWage(day)) }}</td>
                    <td class="px-3 py-2">
                      @if (day.adjustedSessions) {
                        <p class="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">Adjusted</p>
                        <p class="mt-1 max-w-60 truncate text-xs font-semibold text-amber-700">{{ day.adjustedSessions }} session{{ day.adjustedSessions === 1 ? '' : 's' }}</p>
                      } @else {
                        <span class="text-xs font-semibold text-slate-500">{{ day.entries.length }} session{{ day.entries.length === 1 ? '' : 's' }}</span>
                      }
                    </td>
                    <td class="px-3 py-2 text-right">
                      <div class="flex justify-end gap-2">
                        <button pButton type="button" size="small" severity="secondary" icon="pi pi-print" label="Day ticket" (click)="openDayTicket(day)"></button>
                        <button pButton type="button" size="small" severity="secondary" [icon]="isExpanded(day.date) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'" [label]="isExpanded(day.date) ? 'Hide' : 'Sessions'" (click)="toggleDay(day.date)"></button>
                      </div>
                    </td>
                  </tr>
                  @if (isExpanded(day.date)) {
                    <tr class="bg-slate-50/70">
                      <td colspan="9" class="px-3 py-3">
                        <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table class="w-full min-w-[52rem] border-collapse text-xs">
                            <thead class="bg-slate-50 text-left font-black uppercase tracking-wide text-slate-500">
                              <tr>
                                <th class="px-3 py-2">Session</th>
                                <th class="px-3 py-2">Clock in</th>
                                <th class="px-3 py-2">Clock out</th>
                                <th class="px-3 py-2">Gross</th>
                                <th class="px-3 py-2">Break</th>
                                <th class="px-3 py-2">Net</th>
                                <th class="px-3 py-2">Audit</th>
                                <th class="px-3 py-2 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                              @for (entry of day.entries; track entry.id) {
                                <tr>
                                  <td class="px-3 py-2 font-black text-slate-600">Session {{ $index + 1 }}</td>
                                  <td class="px-3 py-2 font-semibold text-slate-700">{{ entry.startedAt | date:'h:mm a' }}</td>
                                  <td class="px-3 py-2">
                                    @if (entry.endedAt) {
                                      <span class="font-semibold text-slate-700">{{ entry.endedAt | date:'h:mm a' }}</span>
                                    } @else {
                                      <p-tag value="open" severity="warn" />
                                    }
                                  </td>
                                  <td class="px-3 py-2 font-black text-slate-800">{{ minutesLabel(entry.durationMinutes || 0) }}</td>
                                  <td class="px-3 py-2 font-black text-amber-700">{{ minutesLabel(entry.pauseMinutes || 0) }}</td>
                                  <td class="px-3 py-2 font-black text-teal-700">{{ minutesLabel(netEntryMinutes(entry)) }}</td>
                                  <td class="px-3 py-2">
                                    @if (entry.override) {
                                      <p class="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black text-amber-800">Adjusted</p>
                                      @if (entry.overrideReason) {
                                        <p class="mt-1 max-w-60 truncate text-xs font-semibold text-amber-700">{{ entry.overrideReason }}</p>
                                      }
                                    } @else {
                                      <span class="text-xs font-semibold text-slate-500">Worker captured</span>
                                    }
                                  </td>
                                  <td class="px-3 py-2 text-right">
                                    <button pButton type="button" size="small" severity="secondary" icon="pi pi-pencil" label="Adjust" [disabled]="!canAdjust()" (click)="openAdjust(entry)"></button>
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  }
                } @empty {
                  <tr>
                    <td colspan="9" class="px-3 py-12 text-center text-sm font-semibold text-slate-500">
                      {{ selectedWorkerId ? 'No clock sessions found for this worker and date range.' : 'Select a worker to load clock sessions.' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <p-dialog
        header="Adjust shift clock"
        [modal]="true"
        [visible]="adjustOpen()"
        [style]="{ width: 'min(40rem, 94vw)' }"
        (visibleChange)="!$event && closeAdjust()"
      >
        @if (selectedEntry(); as entry) {
          <form class="space-y-3" (ngSubmit)="saveAdjustment()">
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-sm font-black text-slate-950">{{ selectedWorker()?.displayName }}</p>
              <p class="mt-1 text-xs font-semibold text-slate-500">
                Original session: {{ entry.startedAt | date:'MMM d, y h:mm a' }} - {{ entry.endedAt ? (entry.endedAt | date:'MMM d, y h:mm a') : 'Open' }}
              </p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="grid gap-1 text-sm font-bold text-slate-700">
                Clock in
                <input class="h-10 rounded-lg border border-slate-300 px-2 font-semibold" type="datetime-local" name="clockStartedAt" [max]="maxDateTimeInput()" [(ngModel)]="adjustForm.startedAt" required />
              </label>
              <label class="grid gap-1 text-sm font-bold text-slate-700">
                Clock out
                <input class="h-10 rounded-lg border border-slate-300 px-2 font-semibold" type="datetime-local" name="clockEndedAt" [max]="maxDateTimeInput()" [(ngModel)]="adjustForm.endedAt" required />
              </label>
            </div>
            <div class="grid gap-2 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm sm:grid-cols-3">
              <p><span class="block text-xs font-black uppercase text-teal-700">Gross</span><strong>{{ minutesLabel(adjustGrossMinutes()) }}</strong></p>
              <p><span class="block text-xs font-black uppercase text-teal-700">Break</span><strong>{{ minutesLabel(entry.pauseMinutes || 0) }}</strong></p>
              <p><span class="block text-xs font-black uppercase text-teal-700">Net</span><strong>{{ minutesLabel(Math.max(0, adjustGrossMinutes() - (entry.pauseMinutes || 0))) }}</strong></p>
            </div>
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Audit reason *
              <textarea class="min-h-24 rounded-lg border border-slate-300 px-3 py-2 font-semibold" name="clockReason" placeholder="Example: worker forgot to clock out; corrected from supervisor confirmation." [(ngModel)]="adjustForm.reason" required></textarea>
            </label>
            @if (adjustError()) {
              <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ adjustError() }}</p>
            }
            <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="closeAdjust()"></button>
              <button pButton type="submit" icon="pi pi-save" label="Save adjustment" [loading]="saving()" [disabled]="saving() || !adjustForm.startedAt || !adjustForm.endedAt || !adjustForm.reason.trim()"></button>
            </div>
          </form>
        }
      </p-dialog>
    </section>
  `
})
export class TimesheetPageComponent {
  protected readonly Math = Math;
  private readonly workerService = inject(WorkerManagementService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly entries = signal<WorkerClockEntryRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly adjustOpen = signal(false);
  protected readonly selectedEntry = signal<WorkerClockEntryRecord | null>(null);
  protected readonly adjustError = signal('');
  protected selectedWorkerId = '';
  protected fromDate = dateInput(firstDayOfMonth(new Date()));
  protected toDate = dateInput(new Date());
  protected adjustForm = { startedAt: '', endedAt: '', reason: '' };

  protected readonly canAdjust = computed(() => this.auth.hasAnyRole(['TENANT_ADMIN', 'OPERATIONS']));
  protected readonly grossMinutes = computed(() => this.entries().reduce((total, entry) => total + (entry.durationMinutes || 0), 0));
  protected readonly pauseMinutes = computed(() => this.entries().reduce((total, entry) => total + (entry.pauseMinutes || 0), 0));
  protected readonly netMinutes = computed(() => this.entries().reduce((total, entry) => total + this.netEntryMinutes(entry), 0));
  protected readonly openEntryCount = computed(() => this.entries().filter((entry) => !entry.endedAt).length);
  protected readonly dayRows = computed(() => timesheetDayRows(this.entries()));
  private readonly expandedDates = signal<Set<string>>(new Set());

  constructor() {
    void this.loadWorkers();
  }

  protected onWorkerSelected(): void {
    void this.loadEntries();
  }

  protected selectedWorker(): WorkerRecord | undefined {
    return this.workers().find((worker) => worker.id === this.selectedWorkerId);
  }

  protected async loadWorkers(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const workers = await firstValueFrom(this.workerService.list());
      this.workers.set(workers);
      const query = this.route.snapshot.queryParamMap;
      const workerId = query.get('workerId') || '';
      this.fromDate = query.get('from') || this.fromDate;
      this.toDate = query.get('to') || this.toDate;
      this.selectedWorkerId = workers.some((worker) => worker.id === workerId) ? workerId : '';
      if (this.selectedWorkerId) {
        await this.loadEntries();
      } else {
        this.entries.set([]);
      }
    } catch (error) {
      this.error.set(errorMessage(error, 'Unable to load workers and timesheets.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async loadEntries(): Promise<void> {
    if (!this.selectedWorkerId) {
      this.entries.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    try {
      this.entries.set(await firstValueFrom(this.workerService.clockEntries(this.selectedWorkerId, this.fromDate, this.toDate)));
      this.expandedDates.set(new Set());
    } catch (error) {
      this.error.set(errorMessage(error, 'Unable to load worker timesheet.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected toggleDay(date: string): void {
    this.expandedDates.update((expanded) => {
      const next = new Set(expanded);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  }

  protected isExpanded(date: string): boolean {
    return this.expandedDates().has(date);
  }

  protected openDayTicket(day: TimesheetDayRow): void {
    void this.router.navigate(['/reports/day-ticket'], {
      queryParams: {
        workerId: this.selectedWorkerId,
        from: day.date,
        to: day.date
      }
    });
  }

  protected exportTimesheetCsv(): void {
    const worker = this.selectedWorker();
    const rows = [
      ['Worker', 'Date', 'First clock in', 'Last clock out', 'Sessions', 'Gross minutes', 'Break minutes', 'Net minutes', 'Hourly rate', 'Estimated wage', 'Adjusted sessions'],
      ...this.dayRows().map((day) => [
        worker?.displayName || '',
        day.date,
        day.firstClockIn ? new Date(day.firstClockIn).toLocaleString() : '',
        day.lastClockOut ? new Date(day.lastClockOut).toLocaleString() : '',
        String(day.entries.length),
        String(day.grossMinutes),
        String(day.pauseMinutes),
        String(day.netMinutes),
        String(this.activeWageRate() || ''),
        this.dayWage(day).toFixed(2),
        String(day.adjustedSessions)
      ])
    ];
    downloadCsv(`timesheet-days-${worker?.displayName || 'worker'}-${this.fromDate}-to-${this.toDate}.csv`, rows);
  }

  protected exportSessionCsv(): void {
    const worker = this.selectedWorker();
    const rows = [
      ['Worker', 'Date', 'Clock in', 'Clock out', 'Gross minutes', 'Break minutes', 'Net minutes', 'Override', 'Override reason'],
      ...this.entries().map((entry) => [
        worker?.displayName || '',
        localDateKey(entry.startedAt),
        new Date(entry.startedAt).toLocaleString(),
        entry.endedAt ? new Date(entry.endedAt).toLocaleString() : 'Open',
        String(entry.durationMinutes || 0),
        String(entry.pauseMinutes || 0),
        String(this.netEntryMinutes(entry)),
        entry.override ? 'Yes' : 'No',
        entry.overrideReason || ''
      ])
    ];
    downloadCsv(`timesheet-sessions-${worker?.displayName || 'worker'}-${this.fromDate}-to-${this.toDate}.csv`, rows);
  }

  protected openAdjust(entry: WorkerClockEntryRecord): void {
    this.selectedEntry.set(entry);
    this.adjustForm = {
      startedAt: toDateTimeInput(entry.startedAt),
      endedAt: toDateTimeInput(entry.endedAt || new Date().toISOString()),
      reason: ''
    };
    this.adjustError.set('');
    this.adjustOpen.set(true);
  }

  protected closeAdjust(): void {
    this.adjustOpen.set(false);
    this.selectedEntry.set(null);
    this.adjustError.set('');
    this.adjustForm = { startedAt: '', endedAt: '', reason: '' };
  }

  protected async saveAdjustment(): Promise<void> {
    const entry = this.selectedEntry();
    if (!entry || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.adjustError.set('');
    this.message.set('');
    try {
      const startedAt = fromDateTimeInput(this.adjustForm.startedAt);
      const endedAt = fromDateTimeInput(this.adjustForm.endedAt);
      if (new Date(endedAt).getTime() <= new Date(startedAt).getTime()) {
        this.adjustError.set('Clock-out time must be after clock-in time.');
        return;
      }
      if (new Date(startedAt).getTime() > Date.now() || new Date(endedAt).getTime() > Date.now()) {
        this.adjustError.set('Clock-in and clock-out adjustments cannot be in the future.');
        return;
      }
      await firstValueFrom(this.workerService.overrideClockEntry(this.selectedWorkerId, entry.id, {
        startedAt,
        endedAt,
        reason: this.adjustForm.reason.trim()
      }));
      await this.loadEntries();
      this.message.set('Timesheet adjustment saved and audited.');
      this.closeAdjust();
    } catch (error) {
      this.adjustError.set(errorMessage(error, 'Unable to save timesheet adjustment.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected adjustGrossMinutes(): number {
    if (!this.adjustForm.startedAt || !this.adjustForm.endedAt) {
      return 0;
    }
    const startedAt = new Date(this.adjustForm.startedAt).getTime();
    const endedAt = new Date(this.adjustForm.endedAt).getTime();
    if (Number.isNaN(startedAt) || Number.isNaN(endedAt) || endedAt <= startedAt) {
      return 0;
    }
    return Math.floor((endedAt - startedAt) / 60000);
  }

  protected netEntryMinutes(entry: WorkerClockEntryRecord): number {
    return Math.max(0, (entry.durationMinutes || 0) - (entry.pauseMinutes || 0));
  }

  protected estimatedWage(): number {
    return (this.netMinutes() / 60) * this.activeWageRate();
  }

  protected dayWage(day: TimesheetDayRow): number {
    return (day.netMinutes / 60) * this.activeWageRate();
  }

  protected activeWageRate(): number {
    return this.selectedWorker()?.hourlyRate ?? 0;
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(value);
  }

  protected maxDateTimeInput(): string {
    return toDateTimeInput(new Date().toISOString());
  }

  protected minutesLabel(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  protected dateLabel(value: string): string {
    return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }).format(localDate(value));
  }
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timesheetDayRows(entries: WorkerClockEntryRecord[]): TimesheetDayRow[] {
  const grouped = new Map<string, WorkerClockEntryRecord[]>();
  for (const entry of entries) {
    const date = localDateKey(entry.startedAt);
    grouped.set(date, [...(grouped.get(date) || []), entry]);
  }
  return [...grouped.entries()]
    .map(([date, dayEntries]) => {
      const sortedEntries = [...dayEntries].sort((left, right) => dateValue(left.startedAt) - dateValue(right.startedAt));
      const endedEntries = sortedEntries.filter((entry) => entry.endedAt);
      const grossMinutes = sortedEntries.reduce((total, entry) => total + (entry.durationMinutes || 0), 0);
      const pauseMinutes = sortedEntries.reduce((total, entry) => total + (entry.pauseMinutes || 0), 0);
      return {
        date,
        entries: sortedEntries,
        firstClockIn: sortedEntries[0]?.startedAt,
        lastClockOut: endedEntries.sort((left, right) => dateValue(right.endedAt) - dateValue(left.endedAt))[0]?.endedAt,
        grossMinutes,
        pauseMinutes,
        netMinutes: Math.max(0, grossMinutes - pauseMinutes),
        openSessions: sortedEntries.filter((entry) => !entry.endedAt).length,
        adjustedSessions: sortedEntries.filter((entry) => entry.override).length
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function localDateKey(value: string): string {
  return dateInput(new Date(value));
}

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

function downloadCsv(filename: string, rows: string[][]): void {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename.replace(/[^\w.\-]+/g, '_');
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function toDateTimeInput(value?: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const response = error as { error?: { error?: { message?: string }; message?: string } };
    return response.error?.error?.message || response.error?.message || fallback;
  }
  return fallback;
}
