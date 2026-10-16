import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import type { CreateWorkOrderRequest, WorkerRecord, WorkOrderRecord } from '@lorne/contracts';
import { WorkOrderFormComponent } from './work-order-form.component';

describe('WorkOrderFormComponent retained worker assignments', () => {
  const activeId = '4c49be5b-3f4c-4883-b82c-8aabbc56bfbd';
  const inactiveId = 'd4c72444-6b61-40d7-b6dd-9ce95df91fac';
  const missingId = '6131efcd-a77e-4002-b4e7-10057f2c51c0';
  const worker = (id: string, name: string): WorkerRecord => ({
    id, displayName: name, status: 'ACTIVE', engagementType: 'FULL_TIME', serviceSkills: [], shifts: [], certifications: []
  } as unknown as WorkerRecord);
  const order = (id = 'order'): WorkOrderRecord => ({
    id, workOrderNumber: '261012-0001', workOrderType: 'SERVICE', title: 'Senior Service - Cambridge Club',
    ownerId: 'owner', propertyId: 'property', source: 'TENANT_PORTAL', status: 'IN_PROGRESS', priority: 'NORMAL',
    assignments: [
      {workerId: activeId, workerName: 'Active Worker', leadWorker: true, assignmentStatus: 'IN_PROGRESS'},
      {workerId: inactiveId, workerName: 'Inactive Worker', leadWorker: false, assignmentStatus: 'ASSIGNED'},
      {workerId: missingId, workerName: 'Missing Worker', leadWorker: false, assignmentStatus: 'ASSIGNED'}
    ], assets: [], materials: [], tasks: [{id: 'task', label: 'Inspect site', assignedWorkerId: inactiveId, phase: 'COMPLETION', required: true}]
  } as unknown as WorkOrderRecord);

  beforeEach(async () => {
    await TestBed.configureTestingModule({imports: [WorkOrderFormComponent], providers: [provideNoopAnimations()]}).compileComponents();
  });

  function setup() {
    const fixture = TestBed.createComponent(WorkOrderFormComponent);
    fixture.componentRef.setInput('properties', []);
    fixture.componentRef.setInput('serviceTypes', []);
    fixture.componentRef.setInput('workers', [worker(activeId, 'Active Worker')]);
    fixture.componentRef.setInput('workOrder', order());
    fixture.detectChanges();
    return fixture;
  }

  it('shows retained unavailable workers and blocks saving instead of silently dropping them', () => {
    const fixture = setup();
    const save = jasmine.createSpy('save');
    fixture.componentInstance.createWorkOrder.subscribe(save);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
    fixture.detectChanges();
    expect(save).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Inactive Worker');
    expect(fixture.nativeElement.textContent).toContain('Missing Worker');
    expect(fixture.nativeElement.textContent).toContain('Cannot save with unavailable worker profiles');
    expect(fixture.nativeElement.querySelectorAll('[role="alert"] button').length).toBe(2);
  });

  it('removes unavailable assignments only after explicit action, and clears their task assignments', () => {
    const fixture = setup();
    let saved: CreateWorkOrderRequest | undefined;
    fixture.componentInstance.createWorkOrder.subscribe(request => saved = request);
    fixture.nativeElement.querySelector('[role="alert"] button').click();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[role="alert"] button').click();
    fixture.detectChanges();
    fixture.componentInstance.submit();
    expect(saved?.assignedWorkerIds).toEqual([activeId]);
    expect(saved?.leadWorkerId).toBe(activeId);
    expect(saved?.taskItems?.[0].assignedWorkerId).toBeUndefined();
  });

  it('does not carry a previous work order lead into the next work order', () => {
    const fixture = setup();
    const nextId = 'new-worker';
    fixture.componentRef.setInput('workers', [worker(activeId, 'Active Worker'), worker(nextId, 'Next Worker')]);
    fixture.componentRef.setInput('workOrder', {...order('next-order'), tasks: [], assignments: [{workerId: nextId, workerName: 'Next Worker', leadWorker: false, assignmentStatus: 'ASSIGNED'}]});
    fixture.detectChanges();
    let saved: CreateWorkOrderRequest | undefined;
    fixture.componentInstance.createWorkOrder.subscribe(request => saved = request);
    fixture.componentInstance.submit();
    expect(saved?.assignedWorkerIds).toEqual([nextId]);
    expect(saved?.leadWorkerId).toBe(nextId);
  });

  it('names the inactive employee but excludes them from the dispatch picker', () => {
    const fixture = setup();
    fixture.componentRef.setInput('workers', [worker(activeId, 'Active Worker'), {...worker(inactiveId, 'Inactive Worker'), status: 'INACTIVE', employeeNumber: 'PT002'}]);
    fixture.detectChanges();
    const state = fixture.componentInstance as unknown as {eligibleWorkers(): WorkerRecord[]; pruneWorkers(): void};
    expect(state.eligibleWorkers().map(worker => worker.id)).toEqual([activeId]);
    expect(fixture.nativeElement.textContent).toContain('Inactive Worker (PT002)');
    state.pruneWorkers();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="alert"] button').length).toBe(2);
  });
});
