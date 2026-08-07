import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WorkerAssignedJob } from '@lorne/contracts';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'lorne-worker-job-card',
  standalone: true,
  imports: [CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-lg shadow-teal-950/10">
      <div class="bg-slate-950 p-5 text-white">
        <div class="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div class="min-w-0">
            <p class="text-xs font-black uppercase tracking-wide text-teal-200">{{ job().workOrderNumber }}</p>
            <h2 class="mt-2 text-3xl font-black leading-tight">{{ job().propertyName }}</h2>
            <p class="mt-2 text-base font-bold text-slate-200">{{ job().title }}</p>
          </div>
          <div class="flex items-start justify-between gap-2 sm:block sm:text-right">
            <p-tag [value]="statusLabel()" [severity]="statusSeverity()" />
            <p class="mt-2 text-sm font-black text-white">{{ windowLabel() }}</p>
          </div>
        </div>
      </div>
      <div class="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Service address</p>
          <p class="mt-1 text-base font-bold leading-7 text-slate-800">{{ job().address }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">{{ job().serviceName || 'General service' }}</span>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ job().ownerName }}</span>
          </div>
        </div>
        <a
          class="touch-action inline-flex min-h-14 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-5 text-base font-black text-teal-800 no-underline"
          [href]="directionsUrl()"
          target="_blank"
          rel="noopener"
        >
          <i class="pi pi-directions mr-2"></i>
          Route
        </a>
      </div>
      <div class="grid gap-2 border-t border-teal-100 bg-slate-50 px-4 py-3 sm:grid-cols-3 sm:px-5">
        <span class="rounded-lg bg-slate-50 px-3 py-2">
          <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Priority</span>
          <span [class]="priorityBadgeClass()">{{ priorityLabel() }}</span>
        </span>
        <span class="rounded-lg bg-slate-50 px-3 py-2">
          <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Assignment</span>
          <span [class]="assignmentBadgeClass()">{{ assignmentLabel() }}</span>
        </span>
        <span class="rounded-lg bg-slate-50 px-3 py-2">
          <span class="block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500">Progress</span>
          <span class="block text-sm font-black text-slate-950">{{ completedChecks() }}/{{ job().checklist.length }} checks</span>
        </span>
      </div>
    </article>
  `
})
export class WorkerJobCardComponent {
  job = input.required<WorkerAssignedJob>();

  protected windowLabel(): string {
    if (!this.job().scheduledStart) {
      return 'Unscheduled';
    }
    const start = new Date(this.job().scheduledStart!);
    const scheduledEnd = this.job().scheduledEnd;
    const end = scheduledEnd ? new Date(scheduledEnd) : null;
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${end ? ` - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  }

  protected completedChecks(): number {
    return this.job().checklist.filter((item) => item.completed).length;
  }

  protected directionsUrl(): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.job().address)}`;
  }

  protected priorityLabel(): string {
    return this.job().priority.toUpperCase().replaceAll('_', ' ');
  }

  protected priorityBadgeClass(): string {
    const base = 'mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-black uppercase leading-none';
    switch (this.job().priority.toUpperCase()) {
      case 'URGENT':
      case 'EMERGENCY':
        return `${base} border-red-200 bg-red-50 text-red-700`;
      case 'HIGH':
        return `${base} border-amber-200 bg-amber-50 text-amber-700`;
      case 'LOW':
        return `${base} border-slate-200 bg-slate-100 text-slate-700`;
      default:
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    }
  }

  protected assignmentLabel(): string {
    return this.job().leadWorker ? 'LEAD' : 'ASSIGNED';
  }

  protected assignmentBadgeClass(): string {
    const base = 'mt-1 inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-black uppercase leading-none';
    return this.job().leadWorker
      ? `${base} border-sky-200 bg-sky-50 text-sky-700`
      : `${base} border-indigo-200 bg-indigo-50 text-indigo-700`;
  }

  protected statusLabel(): string {
    return this.job().status === 'PENDING_COMPLETION'
      ? 'submitted for review'
      : this.job().status.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (this.job().status) {
      case 'COMPLETED':
      case 'APPROVED':
      case 'PAID':
        return 'success';
      case 'IN_PROGRESS':
      case 'ON_SITE':
      case 'TRAVELING':
        return 'info';
      case 'PAUSED':
      case 'ON_HOLD':
      case 'PENDING_COMPLETION':
        return 'warn';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'secondary';
    }
  }
}
