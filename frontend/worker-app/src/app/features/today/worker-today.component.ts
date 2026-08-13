import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { WorkerAssignedJob } from '@lorne/contracts';
import { WorkerCalendarStripComponent } from './components/worker-calendar-strip.component';
import { WorkerJobQueueComponent } from './components/worker-job-queue.component';
import { WorkerJobService } from './services/worker-job.service';
import { dateValue, parseDateInput, toDateInput, workerErrorMessage, workerFacingStatus } from './worker-job-ui';

@Component({
  selector: 'lorne-worker-today',
  standalone: true,
  imports: [ButtonModule, TagModule, WorkerCalendarStripComponent, WorkerJobQueueComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-teal-950/15">
        <div class="flex items-start justify-between gap-3 p-3 sm:p-5">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span class="rounded-md bg-teal-300 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-950">Field workflow</span>
              <span class="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold text-teal-50">{{ selectedDateLabel() }}</span>
            </div>
            <h1 class="mt-2 text-2xl font-black leading-tight sm:mt-3 sm:text-4xl">Today's field board</h1>
            <p class="mt-1 hidden max-w-2xl text-sm font-semibold leading-6 text-slate-300 sm:block">
              Find assigned work orders, check timing, and open the job details to execute travel, work, photos, materials, tools, and completion.
            </p>
          </div>
          <button
            pButton
            type="button"
            severity="secondary"
            icon="pi pi-refresh"
            label="Refresh"
            class="h-10 w-10 shrink-0 !p-0 [&_.p-button-label]:hidden sm:h-auto sm:w-auto sm:!px-4 sm:!py-2 sm:[&_.p-button-label]:inline"
            [loading]="loading()"
            (click)="load()"
          ></button>
        </div>
        <div class="grid grid-cols-4 border-t border-white/10 bg-white/[0.04]">
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Loaded</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ jobs().length }}</span>
          </div>
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Today</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ selectedDayJobs().length }}</span>
          </div>
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Active</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ activeJobCount() }}</span>
          </div>
          <div class="px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Urgent</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ urgentJobCount() }}</span>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }

      <lorne-worker-calendar-strip [selectedDate]="selectedDate()" [jobs]="jobs()" (dateSelected)="selectDate($event)" (move)="moveDays($event)" />

      <div class="grid gap-3 xl:grid-cols-[minmax(30rem,1fr)_24rem]">
        <lorne-worker-job-queue
          class="order-1"
          [selectedDate]="selectedDate()"
          [dayJobs]="selectedDayJobs()"
          [unscheduledJobs]="unscheduledJobs()"
          selectedJobId=""
          (jobSelected)="openJob($event)"
        />

        <section class="order-2 rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
          @if (jobs().length > 0) {
            <div class="space-y-3">
              <div class="min-h-44 rounded-lg border border-slate-200 bg-slate-50 p-5">
                <i class="pi pi-list-check text-lg text-teal-700"></i>
                <h2 class="mt-4 text-lg font-black text-slate-950">Open a work order</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Tap a job from the queue to review address, schedule, route, worker status, and required checks.
                </p>
              </div>
              <div class="min-h-44 rounded-lg border border-slate-200 bg-slate-50 p-5">
                <i class="pi pi-camera text-lg text-teal-700"></i>
                <h2 class="mt-4 text-lg font-black text-slate-950">Capture evidence</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Before, after, issue photos, receipts, and notes are saved to the job timeline.
                </p>
              </div>
              <div class="min-h-44 rounded-lg border border-slate-200 bg-slate-50 p-5">
                <i class="pi pi-box text-lg text-teal-700"></i>
                <h2 class="mt-4 text-lg font-black text-slate-950">Track usage</h2>
                <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  Materials, emergency purchases, tool return, and handoff notes stay with the work order.
                </p>
              </div>
            </div>
          } @else {
            <div class="mx-auto flex max-w-xl flex-col items-center py-8 text-center">
              <span class="grid h-16 w-16 place-items-center rounded-lg bg-teal-50 text-2xl text-teal-700">
                <i class="pi pi-briefcase"></i>
              </span>
              <p class="mt-4 text-2xl font-black text-slate-950">No assigned jobs yet</p>
              <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
                This worker login is valid, but no work orders are assigned in the loaded schedule window. Dispatch can assign a worker from the tenant work-order schedule board.
              </p>
              <div class="mt-5 grid w-full gap-2 sm:grid-cols-3">
                <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Window</span>
                  <span class="mt-1 block text-sm font-black text-slate-950">Past 30 / next 60 days</span>
                </span>
                <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Today</span>
                  <span class="mt-1 block text-sm font-black text-slate-950">{{ selectedDayJobs().length }} jobs</span>
                </span>
                <span class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Queue</span>
                  <span class="mt-1 block text-sm font-black text-slate-950">{{ unscheduledJobs().length }} unscheduled</span>
                </span>
              </div>
            </div>
          }
        </section>
      </div>
    </section>
  `
})
export class WorkerTodayComponent {
  private readonly workerJobService = inject(WorkerJobService);
  private readonly router = inject(Router);

  protected readonly jobs = signal<WorkerAssignedJob[]>([]);
  protected readonly selectedDate = signal(toDateInput(new Date()));
  protected readonly loading = signal(false);
  protected readonly error = signal('');

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
      const anchor = parseDateInput(this.selectedDate());
      const from = new Date(anchor);
      from.setDate(anchor.getDate() - 30);
      const to = new Date(anchor);
      to.setDate(anchor.getDate() + 60);
      const jobs = await firstValueFrom(this.workerJobService.jobs(toDateInput(from), toDateInput(to)));
      this.jobs.set(jobs);
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load assigned jobs. Check backend status and worker profile mapping.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected selectedDayJobs(): WorkerAssignedJob[] {
    return this.jobs()
      .filter((job) => job.scheduledStart && toDateInput(new Date(job.scheduledStart)) === this.selectedDate())
      .sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
  }

  protected unscheduledJobs(): WorkerAssignedJob[] {
    return this.jobs().filter((job) => !job.scheduledStart);
  }

  protected activeJobCount(): number {
    return this.jobs().filter((job) => ['TRAVELING', 'ON_SITE', 'IN_PROGRESS', 'PAUSED'].includes(workerFacingStatus(job))).length;
  }

  protected urgentJobCount(): number {
    return this.jobs().filter((job) => job.priority === 'URGENT' || job.priority === 'HIGH').length;
  }

  protected selectedDateLabel(): string {
    return parseDateInput(this.selectedDate()).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  protected selectDate(value: string): void {
    this.selectedDate.set(value);
  }

  protected moveDays(days: number): void {
    const date = parseDateInput(this.selectedDate());
    date.setDate(date.getDate() + days);
    this.selectDate(toDateInput(date));
    void this.load();
  }

  protected openJob(job: WorkerAssignedJob): void {
    void this.router.navigate(['/jobs', job.id]);
  }
}
