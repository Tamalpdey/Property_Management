import type { WorkerAssignedJob } from '@lorne/contracts';
import { canUseChecklist, checklistDisabledReason, primaryAction, stepForStatus, workerFacingStatus } from './worker-job-ui';

describe('worker execution flow', () => {
  function job(assignmentStatus: WorkerAssignedJob['assignmentStatus'], status: WorkerAssignedJob['status'] = 'IN_PROGRESS'): WorkerAssignedJob {
    return { assignmentStatus, status } as WorkerAssignedJob;
  }

  it('does not use another worker\'s order progress to unlock completion checks', () => {
    const assigned = job('ASSIGNED');
    expect(workerFacingStatus(assigned)).toBe('ASSIGNED');
    expect(stepForStatus(workerFacingStatus(assigned))).toBe('ready');
    expect(canUseChecklist(assigned, 'PRE_START')).toBeTrue();
    expect(canUseChecklist(assigned, 'COMPLETION')).toBeFalse();
  });

  it('maps each assignment to the correct current step and next action', () => {
    const cases = [
      ['ACCEPTED', 'travel', 'ARRIVE_ON_SITE'], ['ON_SITE', 'onsite', 'START_WORK'],
      ['IN_PROGRESS', 'work', 'COMPLETE_WORK'], ['PAUSED', 'work', 'RESUME_WORK']
    ] as const;
    for (const [status, step, action] of cases) {
      const facing = workerFacingStatus(job(status));
      expect(stepForStatus(facing)).toBe(step);
      expect(primaryAction(facing)).toBe(action);
    }
  });

  it('allows completion checks only while this worker is working', () => {
    expect(canUseChecklist(job('IN_PROGRESS'), 'COMPLETION')).toBeTrue();
    expect(canUseChecklist(job('IN_PROGRESS'), 'PRE_START')).toBeFalse();
    expect(canUseChecklist(job('PAUSED'), 'COMPLETION')).toBeFalse();
    expect(checklistDisabledReason(job('PAUSED'), 'COMPLETION')).toContain('Resume');
  });

  it('shows submitted and Done even when the team order is still in progress', () => {
    const submitted = job('COMPLETED');
    expect(workerFacingStatus(submitted)).toBe('PENDING_COMPLETION');
    expect(stepForStatus(workerFacingStatus(submitted))).toBe('complete');
    expect(primaryAction(workerFacingStatus(submitted))).toBeNull();
    expect(canUseChecklist(submitted, 'COMPLETION')).toBeFalse();
  });

  it('locks checklist changes for released, declined and emergency assignments', () => {
    for (const status of ['RELEASED', 'DECLINED', 'LEFT_EMERGENCY'] as const) {
      expect(canUseChecklist(job(status), 'PRE_START')).toBeFalse();
      expect(canUseChecklist(job(status), 'COMPLETION')).toBeFalse();
      expect(checklistDisabledReason(job(status))).toContain('already closed');
    }
  });

  it('keeps future and billing-closed jobs locked', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(canUseChecklist({ ...job('IN_PROGRESS'), scheduledStart: tomorrow.toISOString() })).toBeFalse();
    for (const status of ['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'] as const) {
      expect(canUseChecklist(job('IN_PROGRESS', status), 'COMPLETION')).toBeFalse();
      expect(canUseChecklist(job('ASSIGNED', status), 'PRE_START')).toBeFalse();
    }
  });
});
