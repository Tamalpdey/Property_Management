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

export function isWorkerAssignmentClosed(job: WorkerAssignedJob): boolean {
  return ['COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY'].includes(job.assignmentStatus);
}

export function workerFacingStatus(job: WorkerAssignedJob): WorkOrderStatus {
  if (['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(job.status)) {
    return job.status;
  }
  switch (job.assignmentStatus) {
    case 'COMPLETED':
      return job.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING_COMPLETION';
    case 'RELEASED':
    case 'DECLINED':
    case 'LEFT_EMERGENCY':
      return 'ON_HOLD';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'PAUSED':
      return 'PAUSED';
    case 'ON_SITE':
      return 'ON_SITE';
    case 'ACCEPTED':
      if (job.status === 'ON_SITE') {
        return 'ON_SITE';
      }
      return 'TRAVELING';
    case 'ASSIGNED':
      return 'ASSIGNED';
    default:
      return job.status;
  }
}

export function isFutureJob(job: WorkerAssignedJob, now = new Date()): boolean {
  if (!job.scheduledStart) {
    return false;
  }
  const scheduledStart = new Date(job.scheduledStart);
  return Number.isFinite(scheduledStart.getTime()) && serviceDateKey(scheduledStart) > serviceDateKey(now);
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
  if (isFutureJob(job)) {
    return false;
  }
  if (phase === 'PRE_START') {
    return ['TO_DO', 'CREATED', 'SCHEDULED', 'ASSIGNED', 'TRAVELING', 'ON_SITE'].includes(job.status);
  }
  return ['IN_PROGRESS', 'PAUSED'].includes(job.status);
}

export function checklistDisabledReason(job: WorkerAssignedJob, phase: 'PRE_START' | 'COMPLETION' = 'COMPLETION'): string {
  if (isFutureJob(job)) {
    return 'This job is scheduled for a future date. Field actions unlock on the service date.';
  }
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

function serviceDateKey(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
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
    const apiMessage = fieldMessage || body?.error?.message;
    if (apiMessage) {
      return apiMessage;
    }
    if (error.status === 0) {
      return fallback;
    }
    if (error.status === 401) {
      return 'Your session has expired. Sign in again to continue.';
    }
    if (error.status === 403) {
      return 'You do not have permission to do this action.';
    }
    if (error.status === 413) {
      return 'This file is too large. Choose a smaller file and try again.';
    }
    if (error.status >= 500) {
      return 'Something went wrong on the server. Try again in a moment.';
    }
    return fallback;
  }
  return fallback;
}
