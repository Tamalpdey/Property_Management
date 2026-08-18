import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import type { TenantSettingsRecord, WorkerActivityRecord, WorkerAssignedJob, WorkerClockEntryRecord, WorkOrderRecord } from '@lorne/contracts';
import { WorkerShiftClockService } from '../../core/services/worker-shift-clock.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import { workerErrorMessage } from '../today/worker-job-ui';
import {
  dateInputValue,
  dayTicketActivityRows,
  dayTicketDescription,
  dayTicketHtml,
  DayTicketOptions,
  dayTicketRows,
  minutesLabel,
  printHtmlDocument,
  timeOnly
} from '../../../../../tenant-portal/src/app/features/reports/report-generation';

const CURRENT_WORKER_ID = 'current-worker';

@Component({
  selector: 'lorne-worker-day-ticket',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-teal-950/15">
        <div class="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-md bg-teal-300 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-950">Day ticket</span>
              <span class="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold text-teal-50">{{ selectedDate | date:'EEE, MMM d' }}</span>
            </div>
            <h1 class="mt-2 text-2xl font-black leading-tight sm:text-4xl">Printable field day ticket</h1>
            <p class="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
              Review the same ticket operations can print, including jobs, route stops, activity time, and worker notes.
            </p>
          </div>
          <div class="flex gap-2">
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
            <button pButton type="button" icon="pi pi-print" label="Print" [disabled]="loading()" (click)="printTicket()"></button>
          </div>
        </div>
        <div class="grid grid-cols-4 border-t border-white/10 bg-white/[0.04]">
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Rows</span>
            <span class="mt-0.5 block text-xl font-black">{{ rows().length }}</span>
          </div>
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Jobs</span>
            <span class="mt-0.5 block text-xl font-black">{{ jobs().length }}</span>
          </div>
          <div class="border-r border-white/10 px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Activity</span>
            <span class="mt-0.5 block text-xl font-black">{{ activityRows().length }}</span>
          </div>
          <div class="px-3 py-2.5">
            <span class="block text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">Total</span>
            <span class="mt-0.5 block text-xl font-black">{{ minutesLabel(totalMinutes()) }}</span>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }

      <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
        <div class="grid gap-2 lg:grid-cols-[12rem_1fr_auto] lg:items-end">
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Ticket date
            <input type="date" class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="selectedDate" (change)="load()" />
          </label>
          <div class="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="useActualTiming" [(ngModel)]="options.useActualTiming" />
              Actual time
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="includeTravel" [(ngModel)]="options.includeTravel" />
              Travel
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="includeActivities" [(ngModel)]="options.includeActivities" />
              Activity
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="includeWorkerNotes" [(ngModel)]="options.includeWorkerNotes" />
              Notes
            </label>
            <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
              <input type="checkbox" name="includeTotals" [(ngModel)]="options.includeTotals" />
              Totals
            </label>
          </div>
          <button pButton type="button" icon="pi pi-print" label="Print Day Ticket" [disabled]="loading()" (click)="printTicket()"></button>
        </div>
      </section>

      <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div class="flex items-center justify-between gap-2">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Preview</p>
            <h2 class="text-lg font-black text-slate-950">{{ rows().length }} ticket rows</h2>
          </div>
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ selectedDate }}</span>
        </div>
        <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table class="w-full min-w-[54rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="px-3 py-2">#</th>
                <th class="px-3 py-2">Clock-in</th>
                <th class="px-3 py-2">Clock-out</th>
                <th class="px-3 py-2">Client</th>
                <th class="px-3 py-2">W.O #</th>
                <th class="px-3 py-2">Job description</th>
                <th class="px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (entry of rows(); track rowKey(entry)) {
                <tr>
                  <td class="px-3 py-2 font-black text-slate-500">{{ $index + 1 }}</td>
                  <td class="px-3 py-2 font-semibold text-slate-700">{{ timeOnly(entry.timeIn) }}</td>
                  <td class="px-3 py-2 font-semibold text-slate-700">{{ timeOnly(entry.timeOut) }}</td>
                  <td class="px-3 py-2">
                    <p class="font-black text-slate-950">{{ entry.rowType === 'WORKER_ACTIVITY' ? entry.activity?.locationName || entry.activity?.title : entry.rowType === 'ROUTE_STOP' ? entry.routeStop?.name : entry.workOrder?.propertyName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ entry.rowType === 'WORKER_ACTIVITY' ? activityLabel(entry.activity?.activityType || 'OTHER') : entry.rowType === 'ROUTE_STOP' ? 'Route stop' : entry.workOrder?.ownerName }}</p>
                  </td>
                  <td class="px-3 py-2 font-black text-teal-700">{{ entry.workOrder?.workOrderNumber || 'Worker activity' }}</td>
                  <td class="px-3 py-2 font-semibold text-slate-800">{{ dayTicketDescription(entry, options) }}</td>
                  <td class="px-3 py-2 font-black text-slate-950">{{ minutesLabel(entry.minutes) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No ticket rows for this date.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </section>
  `
})
export class WorkerDayTicketComponent {
  private readonly workerJobService = inject(WorkerJobService);
  protected readonly clock = inject(WorkerShiftClockService);

  protected readonly jobs = signal<WorkerAssignedJob[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly loadoutWorkerName = signal('Worker');
  protected readonly loadoutWorkerId = signal(CURRENT_WORKER_ID);
  protected readonly loadoutActivities = signal<WorkerActivityRecord[]>([]);
  protected readonly settings = signal<TenantSettingsRecord | null>(null);
  protected selectedDate = dateInputValue(new Date());
  protected options: DayTicketOptions = {
    useActualTiming: true,
    includeStatus: true,
    includeService: true,
    includeTravel: true,
    includeActivities: true,
    includeWorkerNotes: true,
    includeTotals: true
  };

  protected readonly timeOnly = timeOnly;
  protected readonly minutesLabel = minutesLabel;
  protected readonly dayTicketDescription = dayTicketDescription;

  constructor() {
    void this.load();
  }

  protected activityRows() {
    return this.options.includeActivities
      ? dayTicketActivityRows(this.loadoutActivities(), this.selectedDate, this.selectedDate)
      : [];
  }

  protected rows() {
    return [
      ...dayTicketRows({ workOrders: this.jobs().map((job) => this.toWorkOrderRecord(job)) } as never, CURRENT_WORKER_ID, this.selectedDate, this.selectedDate, this.options),
      ...this.activityRows()
    ].sort((left, right) => new Date(left.timeIn || '').getTime() - new Date(right.timeIn || '').getTime());
  }

  protected totalMinutes(): number {
    return this.rows().reduce((total, row) => total + row.minutes, 0);
  }

  protected async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const [jobs, loadout, settings] = await Promise.all([
        firstValueFrom(this.workerJobService.jobs(this.selectedDate, this.selectedDate)),
        firstValueFrom(this.workerJobService.loadout(this.selectedDate)),
        firstValueFrom(this.workerJobService.settings())
      ]);
      this.jobs.set(jobs);
      this.settings.set(settings);
      this.loadoutWorkerId.set(loadout.workerId || CURRENT_WORKER_ID);
      this.loadoutWorkerName.set(loadout.workerName || 'Worker');
      this.loadoutActivities.set((loadout.activities ?? []).map((activity) => ({
        ...activity,
        workerId: loadout.workerId || CURRENT_WORKER_ID
      })));
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load Day Ticket. Try again or contact dispatch.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected printTicket(): void {
    printHtmlDocument(dayTicketHtml({
      workerName: this.loadoutWorkerName(),
      dateFrom: this.selectedDate,
      dateTo: this.selectedDate,
      generatedAt: new Date(),
      rows: this.rows(),
      options: this.options,
      shiftSummary: this.currentShiftSummary(),
      settings: this.settings()
    }));
  }

  protected rowKey(entry: ReturnType<WorkerDayTicketComponent['rows']>[number]): string {
    return `${entry.rowType}-${entry.workOrder?.id || entry.activity?.id || 'row'}-${entry.routeStop?.id || 'job'}`;
  }

  protected activityLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  private toWorkOrderRecord(job: WorkerAssignedJob): WorkOrderRecord {
    const notes = job.fieldNotes?.map((note) => `${note.workerName}: ${note.note}`).join('\n');
    const arrivedAt = eventTime(job, ['WORKER_ARRIVE_ON_SITE']);
    const workStartedAt = eventTime(job, ['WORKER_START_WORK', 'WORKER_RESUME_WORK']);
    const finishedAt = eventTime(job, ['WORKER_COMPLETE_WORK']);
    return {
      id: job.id,
      workOrderNumber: job.workOrderNumber,
      workOrderType: job.workOrderType,
      ownerId: '',
      ownerName: job.ownerName,
      propertyId: '',
      propertyName: job.propertyName,
      propertyAddress: job.address,
      serviceName: job.serviceName,
      maintenanceRecordTemplate: job.maintenanceRecordTemplate,
      title: job.title,
      description: job.notes,
      status: job.status,
      source: 'TENANT_PORTAL',
      priority: job.priority,
      scheduledStart: job.scheduledStart,
      scheduledEnd: job.scheduledEnd,
      assignments: [{
        workerId: CURRENT_WORKER_ID,
        workerName: this.loadoutWorkerName(),
        leadWorker: job.leadWorker,
        assignmentStatus: job.assignmentStatus,
        notes,
        actualArrivedAt: arrivedAt,
        actualWorkStartedAt: workStartedAt,
        actualFinishedAt: finishedAt,
        actualWorkMinutes: minutesBetween(workStartedAt || arrivedAt, finishedAt)
      }],
      materials: [],
      assets: [],
      tasks: [],
      routeStops: job.routeStops ?? [],
      linkedWorkOrders: job.linkedWorkOrders ?? [],
      linkedFromWorkOrders: job.linkedFromWorkOrders ?? []
    };
  }

  private currentShiftSummary() {
    if (this.selectedDate !== dateInputValue(new Date())) {
      return undefined;
    }
    const state = this.clock.state();
    if (!state.startedAt) {
      return undefined;
    }
    const entry: WorkerClockEntryRecord = {
      id: 'current-shift',
      workerId: this.loadoutWorkerId(),
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      durationMinutes: minutesBetween(state.startedAt, state.endedAt || new Date().toISOString())
    };
    return {
      clockIn: state.startedAt,
      clockOut: state.endedAt,
      minutes: entry.durationMinutes ?? 0,
      entries: [entry]
    };
  }
}

function eventTime(job: WorkerAssignedJob, actions: string[]): string | undefined {
  const event = job.executionEvents
    ?.filter((item) => actions.includes(item.action))
    .sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime())[0];
  return event?.occurredAt;
}

function minutesBetween(start?: string, end?: string): number {
  if (!start || !end) {
    return 0;
  }
  const diff = new Date(end).getTime() - new Date(start).getTime();
  return diff > 0 ? Math.round(diff / 60000) : 0;
}
