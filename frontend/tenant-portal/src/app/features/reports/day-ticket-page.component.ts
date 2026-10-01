import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { TenantSettingsRecord, WorkerActivityRecord, WorkerClockEntryRecord, WorkerRecord } from '@lorne/contracts';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';
import type { DayTicketEntry, ReportGenerationData } from '../../../../../packages/lorne-contracts/src/lib/report-generation';
import {
  dateInputValue,
  dayTicketActivityRows,
  dayTicketDescription,
  dayTicketEstimatedTravelLabel,
  dayTicketHtml,
  DayTicketOptions,
  dayTicketRowTypeLabel,
  dayTicketRows,
  dayTicketShiftSummary,
  minutesLabel,
  printHtmlDocument,
  ticketTimeLabel,
  timeOnly
} from '../../../../../packages/lorne-contracts/src/lib/report-generation';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { WorkOrderService } from '../work-orders/services/work-order.service';

type TicketRangePreset = 'DAY' | 'WEEK' | 'MONTH' | 'CUSTOM';
type DayTicketData = ReportGenerationData & { generatedAt: Date; workers: WorkerRecord[] };

@Component({
  selector: 'lorne-day-ticket-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-2.5">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <a pButton routerLink="/reports" type="button" severity="secondary" icon="pi pi-arrow-left" label="Reports" class="no-underline"></a>
            <p-tag value="Day ticket" severity="info" />
            <h1 class="text-lg font-bold text-slate-950 md:text-xl">Printable worker daily report</h1>
            @if (analytics(); as data) {
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Updated {{ data.generatedAt | date:'MMM d, h:mm a' }}</span>
            }
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      @if (analytics(); as data) {
        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="grid gap-2 xl:grid-cols-[minmax(12rem,1fr)_10rem_10rem_10rem_minmax(16rem,1fr)_auto]">
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Worker</span>
              <select class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="dayTicketWorkerId" [(ngModel)]="dayTicketWorkerId" (ngModelChange)="loadWorkerTiming()">
                <option value="">Select worker</option>
                @for (worker of data.workers; track worker.id) {
                  <option [value]="worker.id">{{ worker.displayName }}{{ worker.email ? ' · ' + worker.email : '' }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Range</span>
              <select class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="dayTicketRangePreset" [(ngModel)]="dayTicketRangePreset" (ngModelChange)="onDayTicketFilterChange()">
                <option value="DAY">Daily</option>
                <option value="WEEK">Weekly</option>
                <option value="MONTH">Monthly</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">From</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="dayTicketDateFrom" [(ngModel)]="dayTicketDateFrom" (ngModelChange)="onDayTicketFilterChange()" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">To</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="dayTicketDateTo" [(ngModel)]="dayTicketDateTo" [disabled]="dayTicketRangePreset !== 'CUSTOM'" (ngModelChange)="onDayTicketFilterChange()" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Search</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="search" name="dayTicketSearch" placeholder="Client, work order, service, address" [(ngModel)]="searchTerm" />
            </label>
            <button pButton type="button" icon="pi pi-print" label="Print Day Ticket" [disabled]="!dayTicketWorkerId || !dayTicketDateFrom || !dayTicketDateTo || printing()" [loading]="printing()" (click)="printDayTicket(data)"></button>
          </div>

          <div class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            Clock columns use actual job and route-stop timing when enabled. If actual timing is missing, the row is marked as scheduled fallback.
          </div>

          <div class="mt-3 grid gap-2 lg:grid-cols-[1fr_auto] lg:items-start">
            <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-8">
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketUseActualTiming" [(ngModel)]="dayTicketOptions.useActualTiming" />
                Actual time in/out
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeStatus" [(ngModel)]="dayTicketOptions.includeStatus" />
                Status
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeService" [(ngModel)]="dayTicketOptions.includeService" />
                Service details
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeTravel" [(ngModel)]="dayTicketOptions.includeTravel" />
                Travel
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeRouteStops" [(ngModel)]="dayTicketOptions.includeRouteStops" />
                Routes
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeActivities" [(ngModel)]="dayTicketOptions.includeActivities" />
                Activity
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeWorkerNotes" [(ngModel)]="dayTicketOptions.includeWorkerNotes" />
                Special notes
              </label>
              <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input type="checkbox" name="dayTicketIncludeTotals" [(ngModel)]="dayTicketOptions.includeTotals" />
                Totals/signoff
              </label>
            </div>
            <div class="flex min-w-28 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-right">
              <p class="whitespace-nowrap text-xs font-black uppercase tracking-wide text-slate-500">Rows</p>
              <p class="text-lg font-black text-slate-950">{{ rows(data).length }}</p>
            </div>
          </div>
        </section>

        @if (dayTicketWorkerId) {
          <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Shift clock</p>
                <h2 class="text-base font-black text-slate-950">Clock-in, clock-out, breaks, and adjusted sessions</h2>
              </div>
              @if (clockEntries().length) {
                <div class="grid grid-cols-3 gap-2 text-right">
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase text-slate-500">Gross</p>
                    <p class="text-sm font-black text-slate-950">{{ minutesLabel(shiftGrossMinutes()) }}</p>
                  </div>
                  <div class="rounded-lg bg-amber-50 px-3 py-2">
                    <p class="text-xs font-black uppercase text-amber-700">Break</p>
                    <p class="text-sm font-black text-amber-800">{{ minutesLabel(shiftPauseMinutes()) }}</p>
                  </div>
                  <div class="rounded-lg bg-teal-50 px-3 py-2">
                    <p class="text-xs font-black uppercase text-teal-700">Net</p>
                    <p class="text-sm font-black text-teal-800">{{ minutesLabel(shiftNetMinutes()) }}</p>
                  </div>
                </div>
              }
            </div>
            <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table class="w-full min-w-[44rem] border-collapse text-sm">
                <thead class="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-3 py-2">Session</th>
                    <th class="px-3 py-2">Clock in</th>
                    <th class="px-3 py-2">Clock out</th>
                    <th class="px-3 py-2">Break</th>
                    <th class="px-3 py-2">Net</th>
                    <th class="px-3 py-2">Audit</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (entry of clockEntries(); track entry.id) {
                    <tr>
                      <td class="px-3 py-2 font-black text-slate-600">Session {{ $index + 1 }}</td>
                      <td class="px-3 py-2 font-semibold text-slate-700">{{ entry.startedAt | date:'MMM d, h:mm a' }}</td>
                      <td class="px-3 py-2">
                        @if (entry.endedAt) {
                          <span class="font-semibold text-slate-700">{{ entry.endedAt | date:'MMM d, h:mm a' }}</span>
                        } @else {
                          <p-tag value="open" severity="warn" />
                        }
                      </td>
                      <td class="px-3 py-2 font-black text-amber-700">{{ minutesLabel(entry.pauseMinutes || 0) }}</td>
                      <td class="px-3 py-2 font-black text-teal-700">{{ minutesLabel(clockEntryNetMinutes(entry)) }}</td>
                      <td class="px-3 py-2">
                        @if (entry.override) {
                          <span class="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-black uppercase text-amber-800">Adjusted</span>
                          @if (entry.overrideReason) {
                            <p class="mt-1 max-w-80 truncate text-xs font-semibold text-amber-700">{{ entry.overrideReason }}</p>
                          }
                        } @else {
                          <span class="text-xs font-semibold text-slate-500">Worker captured</span>
                        }
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No shift clock records for this worker and date range.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Preview</p>
              <h2 class="text-base font-black text-slate-950">{{ rows(data).length }} ticket rows</h2>
            </div>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ dayTicketDateFrom }} - {{ dayTicketDateTo }}</span>
          </div>
          <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table class="w-full min-w-[64rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">#</th>
                  <th class="px-3 py-2">Clock-in</th>
                  <th class="px-3 py-2">Clock-out</th>
                  <th class="px-3 py-2">Client</th>
                  <th class="px-3 py-2">W.O #</th>
                  <th class="px-3 py-2">Job description</th>
                  <th class="px-3 py-2">Map est.</th>
                  <th class="px-3 py-2">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (entry of rows(data).slice(0, 20); track rowKey(entry)) {
                  <tr>
                    <td class="px-3 py-2 font-black text-slate-500">{{ $index + 1 }}</td>
                    <td class="px-3 py-2 font-semibold text-slate-700">
                      {{ ticketTimeLabel(entry.timeIn, dayTicketDateFrom, dayTicketDateTo) }}
                      @if (entry.timeInFromSchedule) {
                        <span class="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-amber-800">Scheduled</span>
                      }
                      @if (entry.assignment?.timingOverride) {
                        <span class="ml-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-amber-800">Adjusted</span>
                      }
                    </td>
                    <td class="px-3 py-2 font-semibold text-slate-700">
                      {{ ticketTimeLabel(entry.timeOut, dayTicketDateFrom, dayTicketDateTo) }}
                      @if (entry.timeOutFromSchedule) {
                        <span class="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-amber-800">Scheduled</span>
                      }
                      @if (entry.assignment?.timingOverride) {
                        <span class="ml-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-black uppercase text-amber-800">Adjusted</span>
                      }
                    </td>
                    <td class="px-3 py-2">
                      <p class="font-black text-slate-950">{{ entry.rowType === 'WORKER_ACTIVITY' ? entry.activity?.locationName || entry.activity?.title : entry.rowType === 'ROUTE_STOP' ? entry.routeStop?.name : entry.workOrder?.propertyName }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ entry.rowType === 'WORKER_ACTIVITY' ? activityLabel(entry.activity?.activityType || 'OTHER') : entry.rowType === 'ROUTE_STOP' ? 'Route stop' : entry.rowType === 'TRAVEL' ? 'Travel' : entry.workOrder?.ownerName }}</p>
                    </td>
                    <td class="px-3 py-2 font-black text-teal-700">{{ entry.workOrder?.workOrderNumber || 'Worker activity' }}</td>
                    <td class="px-3 py-2">
                      <p class="mb-1 inline-flex rounded-full border border-slate-200 px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-wide text-teal-700">{{ dayTicketRowTypeLabel(entry) }}</p>
                      <p class="font-semibold text-slate-800">{{ dayTicketDescription(entry, dayTicketOptions) }}</p>
                    </td>
                    <td class="px-3 py-2 font-bold text-slate-600">{{ dayTicketEstimatedTravelLabel(entry) }}</td>
                    <td class="px-3 py-2 font-black text-slate-950">{{ minutesLabel(entry.minutes) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="8" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders match this worker and date.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </section>
  `
})
export class DayTicketPageComponent {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly route = inject(ActivatedRoute);
  protected readonly analytics = signal<DayTicketData | null>(null);
  protected readonly settings = signal<TenantSettingsRecord | null>(null);
  protected readonly workerActivities = signal<WorkerActivityRecord[]>([]);
  protected readonly clockEntries = signal<WorkerClockEntryRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly printing = signal(false);
  protected readonly error = signal('');
  protected dayTicketWorkerId = '';
  protected dayTicketRangePreset: TicketRangePreset = 'DAY';
  protected dayTicketDateFrom = dateInputValue(new Date());
  protected dayTicketDateTo = dateInputValue(new Date());
  protected searchTerm = '';
  protected dayTicketOptions: DayTicketOptions = {
    useActualTiming: true,
    includeStatus: true,
    includeService: true,
    includeTravel: true,
    includeRouteStops: true,
    includeActivities: true,
    includeWorkerNotes: true,
    includeTotals: true
  };

  protected readonly timeOnly = timeOnly;
  protected readonly ticketTimeLabel = ticketTimeLabel;
  protected readonly minutesLabel = minutesLabel;
  protected readonly dayTicketDescription = dayTicketDescription;
  protected readonly dayTicketRowTypeLabel = dayTicketRowTypeLabel;
  protected readonly dayTicketEstimatedTravelLabel = dayTicketEstimatedTravelLabel;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.dayTicketWorkerId = params.get('workerId') || '';
    this.dayTicketDateFrom = params.get('from') || this.dayTicketDateFrom;
    this.dayTicketDateTo = params.get('to') || params.get('from') || this.dayTicketDateTo;
    this.dayTicketRangePreset = this.dayTicketDateFrom === this.dayTicketDateTo ? 'DAY' : 'CUSTOM';
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [workers, workOrders, settings] = await Promise.all([
        firstValueFrom(this.workerManagementService.list()),
        firstValueFrom(this.workOrderService.list({
          statusFilter: 'ALL',
          dateFilter: 'CUSTOM',
          customFrom: this.dayTicketDateFrom,
          customTo: this.dayTicketDateTo
        })),
        firstValueFrom(this.tenantSettingsService.get())
      ]);
      this.analytics.set({ workers, workOrders, invoices: [], generatedAt: new Date() });
      this.settings.set(settings);
      await this.loadWorkerTiming();
    } catch {
      this.error.set('Unable to load day ticket.');
    } finally {
      this.loading.set(false);
    }
  }

  protected rows(data: DayTicketData) {
    const rows = [
      ...dayTicketRows(data, this.dayTicketWorkerId, this.dayTicketDateFrom, this.dayTicketDateTo, this.dayTicketOptions),
      ...(this.dayTicketOptions.includeActivities ? dayTicketActivityRows(this.workerActivities(), this.dayTicketDateFrom, this.dayTicketDateTo) : [])
    ].sort((left, right) => new Date(left.timeIn || '').getTime() - new Date(right.timeIn || '').getTime());
    const search = this.searchTerm.trim().toLowerCase();
    return search ? rows.filter((row) => dayTicketSearchText(row).includes(search)) : rows;
  }

  protected async printDayTicket(data: DayTicketData): Promise<void> {
    if (this.printing()) {
      return;
    }
    this.printing.set(true);
    this.error.set('');
    const worker = data.workers.find((item) => item.id === this.dayTicketWorkerId);
    try {
      const [clockEntries, activities] = worker
        ? await Promise.all([
          firstValueFrom(this.workerManagementService.clockEntries(worker.id, this.dayTicketDateFrom, this.dayTicketDateTo)),
          firstValueFrom(this.workerManagementService.activities(worker.id, this.dayTicketDateFrom, this.dayTicketDateTo))
        ])
        : [[], []];
      this.clockEntries.set(clockEntries);
      this.workerActivities.set(activities);
      printHtmlDocument(dayTicketHtml({
        workerName: worker?.displayName || 'Worker',
        workerEmail: worker?.email,
        dateFrom: this.dayTicketDateFrom,
        dateTo: this.dayTicketDateTo,
        generatedAt: data.generatedAt,
        rows: this.rows(data),
        options: this.dayTicketOptions,
        shiftSummary: dayTicketShiftSummary(clockEntries),
        settings: this.settings()
      }));
    } catch {
      this.error.set('Unable to load worker timing for the day ticket.');
    } finally {
      this.printing.set(false);
    }
  }

  protected applyRangePreset(): void {
    if (!this.dayTicketDateFrom || this.dayTicketRangePreset === 'CUSTOM') {
      return;
    }
    const start = localDate(this.dayTicketDateFrom);
    if (this.dayTicketRangePreset === 'DAY') {
      this.dayTicketDateTo = this.dayTicketDateFrom;
      return;
    }
    if (this.dayTicketRangePreset === 'WEEK') {
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      this.dayTicketDateTo = dateInputValue(end);
      return;
    }
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    this.dayTicketDateFrom = dateInputValue(new Date(start.getFullYear(), start.getMonth(), 1));
    this.dayTicketDateTo = dateInputValue(end);
  }

  protected onDayTicketFilterChange(): void {
    this.applyRangePreset();
    void this.load();
  }

  protected async loadWorkerTiming(): Promise<void> {
    if (!this.dayTicketWorkerId || !this.dayTicketDateFrom || !this.dayTicketDateTo) {
      this.workerActivities.set([]);
      this.clockEntries.set([]);
      return;
    }
    try {
      const [clockEntries, activities] = await Promise.all([
        firstValueFrom(this.workerManagementService.clockEntries(this.dayTicketWorkerId, this.dayTicketDateFrom, this.dayTicketDateTo)),
        firstValueFrom(this.workerManagementService.activities(this.dayTicketWorkerId, this.dayTicketDateFrom, this.dayTicketDateTo))
      ]);
      this.clockEntries.set(clockEntries);
      this.workerActivities.set(activities);
    } catch {
      this.workerActivities.set([]);
      this.clockEntries.set([]);
    }
  }

  protected shiftGrossMinutes(): number {
    return this.clockEntries().reduce((total, entry) => total + (entry.durationMinutes || 0), 0);
  }

  protected shiftPauseMinutes(): number {
    return this.clockEntries().reduce((total, entry) => total + (entry.pauseMinutes || 0), 0);
  }

  protected shiftNetMinutes(): number {
    return this.clockEntries().reduce((total, entry) => total + this.clockEntryNetMinutes(entry), 0);
  }

  protected clockEntryNetMinutes(entry: WorkerClockEntryRecord): number {
    return Math.max(0, (entry.durationMinutes || 0) - (entry.pauseMinutes || 0));
  }

  protected rowKey(entry: ReturnType<DayTicketPageComponent['rows']>[number]): string {
    return `${entry.rowType}-${entry.workOrder?.id || entry.activity?.id || 'row'}-${entry.routeStop?.id || 'job'}`;
  }

  protected activityLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }
}

function localDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dayTicketSearchText(row: DayTicketEntry): string {
  return [
    row.workOrder?.workOrderNumber,
    row.workOrder?.title,
    row.workOrder?.description,
    row.workOrder?.ownerName,
    row.workOrder?.ownerCode,
    row.workOrder?.propertyName,
    row.workOrder?.propertyCode,
    row.workOrder?.propertyAddress,
    row.workOrder?.serviceName,
    row.workOrder?.status,
    row.assignment?.workerName,
    row.routeStop?.name,
    row.routeStop?.address,
    row.activity?.title,
    row.activity?.activityType,
    row.activity?.locationName,
    row.activity?.address,
    row.activity?.notes
  ].filter(Boolean).join(' ').toLowerCase();
}
