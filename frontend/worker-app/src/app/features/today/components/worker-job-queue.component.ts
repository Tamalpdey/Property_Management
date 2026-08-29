import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { WorkerAssignedJob } from '@lorne/contracts';
import { workerFacingStatus } from '../worker-job-ui';

type JobFilter = 'ALL' | 'ACTIVE' | 'SCHEDULED' | 'DONE' | 'NEEDS_HELP';

@Component({
  selector: 'lorne-worker-job-queue',
  standalone: true,
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="space-y-3">
      <div class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm sm:p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-black uppercase tracking-wide text-teal-700">{{ selectedDate() | date:'MMM d' }}</h2>
            <p class="text-xs font-bold text-slate-500">{{ visibleDayJobs().length }} visible / {{ dayJobs().length }} scheduled</p>
          </div>
          <span class="grid h-9 min-w-9 place-items-center rounded-lg bg-slate-950 px-2 text-sm font-black text-white">{{ dayJobs().length }}</span>
        </div>

        <div class="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <label class="relative block">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"></i>
            <input
              class="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm font-semibold outline-none focus:border-teal-500 focus:bg-white"
              name="jobSearch"
              placeholder="Search job, property, WO"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
            />
          </label>
          <select
            class="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-teal-500"
            name="jobFilter"
            [ngModel]="filter()"
            (ngModelChange)="filter.set($event)"
          >
            <option value="ALL">All statuses</option>
            <option value="ACTIVE">Active work</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="DONE">Done</option>
            <option value="NEEDS_HELP">Needs help</option>
          </select>
        </div>

        <div class="mt-3 space-y-2">
          @for (job of visibleDayJobs(); track job.id) {
            <button
              type="button"
              class="touch-action w-full rounded-lg border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-4"
              [class.border-teal-500]="job.id === selectedJobId()"
              [class.bg-teal-50]="job.id === selectedJobId()"
              [class.border-slate-200]="job.id !== selectedJobId()"
              [class.bg-white]="job.id !== selectedJobId()"
              (click)="jobSelected.emit(job)"
            >
              <span class="flex items-start justify-between gap-3">
                <span class="min-w-0">
                  <span class="flex min-w-0 flex-wrap items-center gap-2">
                    <span class="truncate text-xs font-black text-teal-700">{{ job.workOrderNumber }}</span>
                    <span [class]="orderBadgeClass(job)">{{ orderStatusLabel(job) }}</span>
                    <span [class]="workerBadgeClass(job)">Me: {{ assignmentStatusLabel(job) }}</span>
                  </span>
                </span>
                <span
                  class="shrink-0 rounded-full px-2 py-1 text-[0.68rem] font-black"
                  [class.bg-red-100]="timingTone(job) === 'late'"
                  [class.text-red-700]="timingTone(job) === 'late'"
                  [class.bg-teal-100]="timingTone(job) === 'now'"
                  [class.text-teal-800]="timingTone(job) === 'now'"
                  [class.bg-slate-100]="timingTone(job) === 'future'"
                  [class.text-slate-600]="timingTone(job) === 'future'"
                >{{ timingLabel(job) }}</span>
              </span>
              <span class="mt-2 block text-base font-black leading-tight text-slate-950">{{ job.title }}</span>
              <span class="mt-1 block truncate text-sm font-bold text-slate-700">{{ job.propertyName }}</span>
              <span class="mt-1 flex flex-wrap items-center gap-1.5">
                <span class="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[0.65rem] font-black text-teal-700">{{ job.propertyCode }}</span>
                <span class="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.65rem] font-black text-slate-600">{{ job.ownerCode }}</span>
              </span>
              <span class="mt-1 block truncate text-xs font-semibold text-slate-500">{{ job.ownerName }}{{ job.serviceName ? ' · ' + job.serviceName : '' }}</span>
            </button>
          } @empty {
            <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm font-bold leading-6 text-slate-500">
              No matching jobs for this date.
            </p>
          }
        </div>
      </div>

      @if (visibleUnscheduledJobs().length > 0) {
        <div class="rounded-lg border border-amber-100 bg-white p-3 shadow-sm sm:p-4">
          <h2 class="mb-2 text-sm font-black uppercase tracking-wide text-amber-700">Unscheduled queue</h2>
          <div class="space-y-2">
            @for (job of visibleUnscheduledJobs(); track job.id) {
              <button type="button" class="touch-action w-full rounded-lg border border-amber-200 bg-amber-50 p-3 text-left shadow-sm sm:p-4" (click)="jobSelected.emit(job)">
                <span class="flex items-start justify-between gap-2">
                  <span class="min-w-0">
                    <span class="flex min-w-0 flex-wrap items-center gap-2">
                      <span class="truncate text-xs font-black text-teal-700">{{ job.workOrderNumber }}</span>
                      <span [class]="orderBadgeClass(job)">{{ orderStatusLabel(job) }}</span>
                      <span [class]="workerBadgeClass(job)">Me: {{ assignmentStatusLabel(job) }}</span>
                    </span>
                  </span>
                  <span class="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[0.68rem] font-black text-amber-800">unscheduled</span>
                </span>
                <span class="mt-1 block text-base font-black text-slate-950">{{ job.title }}</span>
                <span class="mt-1 block truncate text-sm font-bold text-slate-700">{{ job.propertyName }}</span>
                <span class="mt-1 flex flex-wrap items-center gap-1.5">
                  <span class="rounded bg-teal-100 px-1.5 py-0.5 font-mono text-[0.65rem] font-black text-teal-800">{{ job.propertyCode }}</span>
                  <span class="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[0.65rem] font-black text-amber-800">{{ job.ownerCode }}</span>
                </span>
              </button>
            }
          </div>
        </div>
      }
    </aside>
  `
})
export class WorkerJobQueueComponent {
  selectedDate = input.required<string>();
  dayJobs = input.required<WorkerAssignedJob[]>();
  unscheduledJobs = input.required<WorkerAssignedJob[]>();
  selectedJobId = input.required<string>();
  jobSelected = output<WorkerAssignedJob>();

  protected readonly search = signal('');
  protected readonly filter = signal<JobFilter>('ALL');

  protected visibleDayJobs(): WorkerAssignedJob[] {
    return this.dayJobs().filter((job) => this.matches(job));
  }

  protected visibleUnscheduledJobs(): WorkerAssignedJob[] {
    return this.unscheduledJobs().filter((job) => this.matches(job));
  }

  protected timingLabel(job: WorkerAssignedJob): string {
    if (!job.scheduledStart) {
      return 'unscheduled';
    }
    const now = new Date();
    const start = new Date(job.scheduledStart);
    const end = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
    if (end && now > end && !isDone(job)) {
      return 'late';
    }
    if (now >= start && (!end || now <= end) && !isDone(job)) {
      return 'now';
    }
    return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  protected timingTone(job: WorkerAssignedJob): 'late' | 'now' | 'future' {
    const label = this.timingLabel(job);
    if (label === 'late') {
      return 'late';
    }
    if (label === 'now') {
      return 'now';
    }
    return 'future';
  }

  protected orderStatusLabel(job: WorkerAssignedJob): string {
    return job.status.toLowerCase().replaceAll('_', ' ');
  }

  protected assignmentStatusLabel(job: WorkerAssignedJob): string {
    return job.assignmentStatus.toLowerCase().replaceAll('_', ' ');
  }

  protected orderBadgeClass(job: WorkerAssignedJob): string {
    return badgeClass(job.status);
  }

  protected workerBadgeClass(job: WorkerAssignedJob): string {
    return badgeClass(workerFacingStatus(job), 'border-indigo-100 bg-indigo-50 text-indigo-700');
  }

  private matches(job: WorkerAssignedJob): boolean {
    const query = this.search().trim().toLowerCase();
    const matchesQuery = !query || [job.workOrderNumber, job.propertyCode, job.ownerCode, job.title, job.propertyName, job.ownerName, job.serviceName ?? ''].some((value) => value.toLowerCase().includes(query));
    return matchesQuery && this.matchesFilter(job);
  }

  private matchesFilter(job: WorkerAssignedJob): boolean {
    switch (this.filter()) {
      case 'ACTIVE':
        return ['TRAVELING', 'ON_SITE', 'IN_PROGRESS', 'PAUSED'].includes(workerFacingStatus(job));
      case 'SCHEDULED':
        return ['TO_DO', 'CREATED', 'SCHEDULED', 'ASSIGNED'].includes(workerFacingStatus(job));
      case 'DONE':
        return isDone(job);
      case 'NEEDS_HELP':
        return ['ON_HOLD', 'PENDING_COMPLETION', 'CANCELLED'].includes(workerFacingStatus(job));
      default:
        return true;
    }
  }
}

function isDone(job: WorkerAssignedJob): boolean {
  return ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(workerFacingStatus(job));
}

function badgeClass(status: string, fallback = 'border-slate-200 bg-slate-50 text-slate-700'): string {
  const base = 'inline-flex rounded-full border px-2 py-1 text-[0.64rem] font-black uppercase leading-none';
  if (['IN_PROGRESS', 'ON_SITE', 'TRAVELING', 'PAUSED'].includes(status)) {
    return `${base} border-teal-100 bg-teal-50 text-teal-700`;
  }
  if (['ASSIGNED', 'ACCEPTED', 'TO_DO', 'SCHEDULED', 'CREATED'].includes(status)) {
    return `${base} border-blue-100 bg-blue-50 text-blue-700`;
  }
  if (['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(status)) {
    return `${base} border-emerald-100 bg-emerald-50 text-emerald-700`;
  }
  if (['ON_HOLD', 'LEFT_EMERGENCY', 'RELEASED', 'DECLINED', 'CANCELLED'].includes(status)) {
    return `${base} border-amber-100 bg-amber-50 text-amber-800`;
  }
  return `${base} ${fallback}`;
}
