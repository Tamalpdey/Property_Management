import { HttpErrorResponse } from '@angular/common/http';
import { WorkerAssignedJob, WorkerJobAction, WorkerStepKey, WorkOrderStatus } from '@lorne/contracts';

export const WORKER_STEPS: Array<{ key: WorkerStepKey; label: string; icon: string }> = [
  { key: 'ready', label: 'Ready', icon: 'pi pi-check-circle' },
  { key: 'travel', label: 'Travel', icon: 'pi pi-map' },
  { key: 'onsite', label: 'On site', icon: 'pi pi-map-marker' },
  { key: 'work', label: 'Work', icon: 'pi pi-wrench' },
  { key: 'photos', label: 'Photos', icon: 'pi pi-camera' },
  { key: 'complete', label: 'Done', icon: 'pi pi-verified' }
];

export function stepForStatus(status: WorkOrderStatus): WorkerStepKey {
  if (status === 'TRAVELING') {
    return 'travel';
  }
  if (status === 'ON_SITE') {
    return 'onsite';
  }
  if (status === 'IN_PROGRESS' || status === 'PAUSED') {
    return 'work';
  }
  if (status === 'PENDING_COMPLETION' || status === 'COMPLETED' || status === 'APPROVED') {
    return 'complete';
  }
  return 'ready';
}

export function primaryAction(status: WorkOrderStatus): WorkerJobAction | null {
  switch (status) {
    case 'TO_DO':
    case 'CREATED':
    case 'SCHEDULED':
    case 'ASSIGNED':
      return 'START_TRAVEL';
    case 'TRAVELING':
      return 'ARRIVE_ON_SITE';
    case 'ON_SITE':
      return 'START_WORK';
    case 'IN_PROGRESS':
      return 'COMPLETE_WORK';
    case 'PAUSED':
      return 'RESUME_WORK';
    default:
      return null;
  }
}

export function primaryActionLabel(job: WorkerAssignedJob): string {
  switch (job.status) {
    case 'TO_DO':
    case 'CREATED':
    case 'SCHEDULED':
    case 'ASSIGNED':
      return 'Start travel';
    case 'TRAVELING':
      return 'Arrived';
    case 'ON_SITE':
      return 'Start work';
    case 'IN_PROGRESS':
      return 'Complete work';
    case 'PAUSED':
      return 'Resume work';
    case 'PENDING_COMPLETION':
      return 'Submitted';
    case 'COMPLETED':
      return 'Completed';
    case 'APPROVED':
      return 'Approved';
    case 'ON_HOLD':
      return 'On hold';
    case 'CANCELLED':
      return 'Cancelled';
    case 'DRAFT':
    case 'PENDING':
      return 'Waiting';
    default:
      return 'Done';
  }
}

export function canUseChecklist(job: WorkerAssignedJob, phase: 'PRE_START' | 'COMPLETION' = 'COMPLETION'): boolean {
  if (phase === 'PRE_START') {
    return ['TO_DO', 'CREATED', 'SCHEDULED', 'ASSIGNED', 'TRAVELING', 'ON_SITE'].includes(job.status);
  }
  return ['IN_PROGRESS', 'PAUSED'].includes(job.status);
}

export function checklistDisabledReason(job: WorkerAssignedJob, phase: 'PRE_START' | 'COMPLETION' = 'COMPLETION'): string {
  if (phase === 'PRE_START') {
    if (['IN_PROGRESS', 'PAUSED', 'PENDING_COMPLETION', 'COMPLETED', 'APPROVED'].includes(job.status)) {
      return 'Pre-start checks are closed after work starts.';
    }
    return 'Pre-start checks unlock when the job is assigned.';
  }
  if (job.status === 'PAUSED') {
    return 'Work is paused. Resume before completing more checks.';
  }
  if (['PENDING_COMPLETION', 'COMPLETED', 'APPROVED'].includes(job.status)) {
    return 'Completion checks are already submitted for review.';
  }
  return 'Checklist unlocks after you start work on site.';
}

export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function toDateInput(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

export function workerErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { error?: { message?: string; fields?: Array<{ field: string; message: string }> } } | undefined;
    const fieldMessage = body?.error?.fields?.[0]?.message;
    return fieldMessage || body?.error?.message || error.message || fallback;
  }
  return fallback;
}
