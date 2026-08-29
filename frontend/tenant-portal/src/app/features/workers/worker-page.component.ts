import { ChangeDetectionStrategy, Component, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type {
  TenantRoleOption,
  CreateTenantUserRequest,
  UpdateTenantUserRequest,
  ServiceType,
  TenantAsset,
  WorkerRecord,
  CreateWorkerRequest,
  UpdateWorkerStatusRequest,
  CreateWorkOrderRequest,
  WorkOrderStatus,
  WorkOrderRecord
} from '@lorne/contracts';
import { AssetService } from '../inventory/services/asset.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { TenantUserDialogComponent } from '../users/components/tenant-user-dialog.component';
import { TenantUserService } from '../users/services/tenant-user.service';
import { WorkOrderService } from '../work-orders/services/work-order.service';
import { Worker360ViewComponent } from './components/worker-360-view.component';
import { WorkerListComponent } from './components/worker-list.component';
import { WorkerOnboardingFormComponent } from './components/worker-onboarding-form.component';
import { WorkerManagementService } from './services/worker-management.service';
import { TenantAccessService } from '../../core/services/tenant-access.service';
import { VoiceNoteButtonComponent } from '../../shared/voice-note-button.component';

type WorkerStatusFilter = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE' | 'TERMINATED' | 'ALL';

@Component({
  selector: 'lorne-worker-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, TagModule, TenantUserDialogComponent, VoiceNoteButtonComponent, Worker360ViewComponent, WorkerListComponent, WorkerOnboardingFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Workers" severity="success" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Workers</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ activeWorkerCount() }} active / {{ workers().length }} total</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select class="rounded-lg border border-slate-300 px-2 py-2 text-sm font-bold text-slate-700" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)">
              <option value="ACTIVE">Active workers</option>
              <option value="ON_LEAVE">On leave</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
              <option value="ALL">All workers</option>
            </select>
            <button pButton type="button" icon="pi pi-plus" label="Add worker" (click)="openCreate()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      @if (loading()) {
        <div class="flex min-h-64 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="text-center">
            <i class="pi pi-spin pi-spinner text-3xl text-teal-600"></i>
            <p class="mt-3 text-sm font-bold text-slate-700">Loading workers...</p>
          </div>
        </div>
      } @else {
        <lorne-worker-list
          [workers]="displayedWorkers()"
          [canManageAppLogins]="canManageAppLogins()"
          (viewWorker)="openWorker360($event)"
          (createAppLogin)="openAppLogin($event)"
          (editWorker)="openEdit($event)"
          (editWorkerSection)="openEdit($event.worker, $event.tabIndex)"
          (assignWorkOrder)="openAssignWorkOrder($event)"
          (assignEquipment)="assignEquipment($event)"
          (messageWorker)="openWorkerMessage($event)"
          (updateWorkerStatus)="updateStatus($event.worker, $event.status)"
          (markWorkerOnLeave)="openLeaveDialog($event)"
          (deleteWorker)="delete($event)"
        />
      }

      <p-dialog
        [header]="editingWorker() ? 'Update worker' : 'Add worker'"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: '56rem', maxWidth: '94vw', height: '44rem', maxHeight: '90vh' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="closeWorkerDialog($event)"
      >
        <lorne-worker-onboarding-form [serviceTypes]="serviceTypes()" [saving]="saving()" (createWorker)="saveWorker($event)" />
      </p-dialog>

      <p-dialog
        header="Worker 360"
        [modal]="true"
        [visible]="showWorker360()"
        [style]="{ width: '92rem', maxWidth: '98vw', height: '54rem', maxHeight: '94vh' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'hidden' }"
        (visibleChange)="onWorker360Visible($event)"
      >
        @if (selectedWorker360(); as worker) {
          <lorne-worker-360-view
            [worker]="worker"
            [workOrders]="workOrders()"
            [assets]="assets()"
            [canManageAppLogins]="canManageAppLogins()"
            (createAppLogin)="openAppLoginFrom360($event)"
            (editWorker)="openEditFrom360($event)"
            (editWorkerSection)="openEditSectionFrom360($event.worker, $event.tabIndex)"
            (assignWorkOrder)="openAssignWorkOrderFrom360($event)"
            (assignEquipment)="assignEquipmentFrom360($event)"
          />
        }
      </p-dialog>

      <p-dialog
        header="Assign work order"
        [modal]="true"
        [visible]="showAssignWorkOrder()"
        [style]="{ width: '46rem', maxWidth: '94vw', height: '34rem', maxHeight: '90vh' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }"
        (visibleChange)="onAssignWorkOrderVisible($event)"
      >
        @if (assigningWorker(); as worker) {
          <form class="flex min-h-0 flex-1 flex-col gap-3" (ngSubmit)="assignSelectedWorkOrder()">
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-sm font-black text-slate-950">{{ worker.displayName }}</p>
              <p class="mt-1 text-xs font-semibold text-slate-500">{{ engagementLabel(worker.engagementType) }} · {{ worker.email || 'No email linked' }}</p>
            </div>

            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Open work order</span>
              <select
                class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
                name="assignWorkOrderId"
                required
                [ngModel]="assignWorkOrderId()"
                (ngModelChange)="assignWorkOrderId.set($event)"
              >
                <option value="">Select work order</option>
                @for (workOrder of assignableWorkOrders(worker); track workOrder.id) {
                  <option [value]="workOrder.id">
                    {{ workOrder.workOrderNumber }} · {{ workOrder.title }} · {{ workOrder.propertyName }}{{ workOrder.scheduledStart ? ' · ' + scheduleOptionLabel(workOrder) : ' · unscheduled' }}
                  </option>
                }
              </select>
            </label>

            @if (assignableWorkOrders(worker).length === 0) {
              <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-semibold text-amber-800">
                No open work orders are available for this worker. Completed, cancelled, invoiced, and already assigned jobs are hidden.
              </p>
            } @else if (selectedAssignableWorkOrder(); as workOrder) {
              <div class="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Selected work</p>
                <p class="mt-1 text-sm font-black text-slate-950">{{ workOrder.title }}</p>
                <p class="mt-1 text-xs font-semibold text-slate-600">{{ workOrder.propertyName }} · {{ workOrder.serviceName || 'General service' }}</p>
                <p class="mt-1 text-xs font-semibold text-slate-600">{{ scheduleOptionLabel(workOrder) }}</p>
              </div>
            }

            <label class="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                class="mt-0.5 h-4 w-4"
                type="checkbox"
                name="assignAsLead"
                [ngModel]="assignAsLead()"
                (ngModelChange)="assignAsLead.set($event)"
              />
              <span>
                Assign as lead worker
                <span class="block text-xs font-semibold text-slate-500">If unchecked, the current lead stays in place. If no lead exists, this worker becomes lead automatically.</span>
              </span>
            </label>

            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
              Dispatch override is applied from this menu so operations can assign flexibly. Skill validation still applies.
            </p>

            @if (assignError()) {
              <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ assignError() }}</p>
            }

            <div class="mt-auto flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="closeAssignWorkOrder()"></button>
              <button pButton type="submit" icon="pi pi-calendar-plus" [loading]="assignSaving()" [disabled]="assignableWorkOrders(worker).length === 0" label="Assign work order"></button>
            </div>
          </form>
        }
      </p-dialog>

      <p-dialog
        header="Mark worker on leave"
        [modal]="true"
        [visible]="showLeaveDialog()"
        [style]="{ width: '34rem', maxWidth: '94vw', height: '25rem', maxHeight: '90vh' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="onLeaveVisible($event)"
      >
        @if (leaveWorker(); as worker) {
          <form class="grid gap-3" (ngSubmit)="markOnLeave()">
            <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p class="text-sm font-black text-slate-950">{{ worker.displayName }}</p>
              <p class="mt-1 text-xs font-semibold text-amber-800">Set the leave window so dispatch can filter and avoid assigning this worker.</p>
            </div>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-sm font-bold text-slate-700">Leave starts</span>
                <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="date" name="leaveStartDate" required [(ngModel)]="leaveForm.leaveStartDate" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-bold text-slate-700">Leave ends</span>
                <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" type="date" name="leaveEndDate" required [(ngModel)]="leaveForm.leaveEndDate" />
              </label>
            </div>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Reason</span>
              <textarea class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold" name="leaveReason" rows="3" [(ngModel)]="leaveForm.leaveReason"></textarea>
            </label>
            <div class="flex flex-wrap items-center gap-2">
              <lorne-voice-note-button
                [text]="leaveForm.leaveReason"
                label="Speak leave reason"
                [showUnsupported]="true"
                (textChange)="leaveForm.leaveReason = $event"
                (error)="leaveError.set($event)"
              />
            </div>
            @if (leaveError()) {
              <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ leaveError() }}</p>
            }
            <div class="flex justify-end gap-2">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="closeLeaveDialog()"></button>
              <button pButton type="submit" icon="pi pi-pause-circle" [loading]="leaveSaving()" label="Mark on leave"></button>
            </div>
          </form>
        }
      </p-dialog>

      <lorne-tenant-user-dialog
        title="Create worker app login"
        submitLabel="Save app login"
        [visible]="showAppLogin()"
        [roles]="roles()"
        [workers]="workers()"
        [linkedWorker]="selectedLoginWorker()"
        [saving]="loginSaving()"
        (visibleChange)="showAppLogin.set($event)"
        (saveUser)="createAppLogin($event)"
      />
    </section>
  `
})
export class WorkerPageComponent {
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly tenantUserService = inject(TenantUserService);
  private readonly workOrderService = inject(WorkOrderService);
  private readonly assetService = inject(AssetService);
  private readonly router = inject(Router);
  private readonly access = inject(TenantAccessService);
  protected readonly canManageAppLogins = this.access.canManageWorkerAppLogins;
  @ViewChild(WorkerOnboardingFormComponent) private onboardingForm?: WorkerOnboardingFormComponent;
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly assets = signal<TenantAsset[]>([]);
  protected readonly filteredWorkers = computed(() => this.statusFilter() === 'ALL'
    ? this.workers()
    : this.workers().filter((worker) => worker.status === this.statusFilter()));
  protected readonly displayedWorkers = computed(() => this.filteredWorkers());
  protected readonly activeWorkerCount = computed(() => this.workers().filter((worker) => worker.status === 'ACTIVE').length);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly roles = signal<TenantRoleOption[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal<WorkerStatusFilter>('ACTIVE');
  protected readonly saving = signal(false);
  protected readonly loginSaving = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
  protected readonly showWorker360 = signal(false);
  protected readonly showLeaveDialog = signal(false);
  protected readonly showAssignWorkOrder = signal(false);
  protected readonly showAppLogin = signal(false);
  protected readonly selectedWorker360 = signal<WorkerRecord | null>(null);
  protected readonly leaveWorker = signal<WorkerRecord | null>(null);
  protected readonly assigningWorker = signal<WorkerRecord | null>(null);
  protected readonly assignWorkOrderId = signal('');
  protected readonly assignAsLead = signal(false);
  protected readonly assignSaving = signal(false);
  protected readonly assignError = signal('');
  protected readonly selectedAssignableWorkOrder = computed(() => {
    const workOrderId = this.assignWorkOrderId();
    return this.workOrders().find((workOrder) => workOrder.id === workOrderId) || null;
  });
  protected readonly selectedLoginWorker = signal<WorkerRecord | null>(null);
  protected readonly editingWorker = signal<WorkerRecord | null>(null);
  protected readonly leaveSaving = signal(false);
  protected readonly leaveError = signal('');
  protected leaveForm = {
    leaveStartDate: '',
    leaveEndDate: '',
    leaveReason: ''
  };

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [workers, catalog, roles, workOrders, assetCatalog] = await Promise.all([
        firstValueFrom(this.workerManagementService.list()),
        firstValueFrom(this.serviceCatalogService.catalog()),
        firstValueFrom(this.tenantUserService.roles()),
        firstValueFrom(this.workOrderService.list({ statusFilter: 'ALL', dateFilter: 'ALL' })),
        firstValueFrom(this.assetService.catalog())
      ]);
      this.workers.set(workers);
      this.serviceTypes.set(catalog.serviceTypes);
      this.roles.set(roles);
      this.workOrders.set(workOrders);
      this.assets.set(assetCatalog.assets);
    } catch {
      this.error.set('Unable to load workers. Check backend status and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingWorker.set(null);
    this.showCreate.set(true);
    setTimeout(() => this.onboardingForm?.reset());
  }

  protected openEdit(worker: WorkerRecord, tabIndex = 0): void {
    this.editingWorker.set(worker);
    this.showCreate.set(true);
    setTimeout(() => this.onboardingForm?.loadWorker(worker, tabIndex));
  }

  protected closeWorkerDialog(visible: boolean): void {
    this.showCreate.set(visible);
    if (!visible) {
      this.editingWorker.set(null);
      this.onboardingForm?.reset();
    }
  }

  protected openWorker360(worker: WorkerRecord): void {
    this.selectedWorker360.set(worker);
    this.showWorker360.set(true);
  }

  protected onWorker360Visible(visible: boolean): void {
    this.showWorker360.set(visible);
    if (!visible) {
      this.selectedWorker360.set(null);
    }
  }

  protected openEditFrom360(worker: WorkerRecord): void {
    this.showWorker360.set(false);
    this.selectedWorker360.set(null);
    this.openEdit(worker);
  }

  protected openEditSectionFrom360(worker: WorkerRecord, tabIndex: number): void {
    this.showWorker360.set(false);
    this.selectedWorker360.set(null);
    this.openEdit(worker, tabIndex);
  }

  protected openAppLoginFrom360(worker: WorkerRecord): void {
    this.showWorker360.set(false);
    this.selectedWorker360.set(null);
    this.openAppLogin(worker);
  }

  protected assignEquipmentFrom360(worker: WorkerRecord): void {
    this.showWorker360.set(false);
    this.selectedWorker360.set(null);
    this.assignEquipment(worker);
  }

  protected openAssignWorkOrderFrom360(worker: WorkerRecord): void {
    this.showWorker360.set(false);
    this.selectedWorker360.set(null);
    this.openAssignWorkOrder(worker);
  }

  protected openAssignWorkOrder(worker: WorkerRecord): void {
    this.assigningWorker.set(worker);
    this.assignWorkOrderId.set(this.assignableWorkOrders(worker)[0]?.id || '');
    this.assignAsLead.set(false);
    this.assignError.set('');
    this.showAssignWorkOrder.set(true);
  }

  protected openWorkerMessage(worker: WorkerRecord): void {
    if (!worker.email) {
      this.error.set('Create an app login or add an email before starting a worker chat.');
      return;
    }
    void this.router.navigate(['/messages'], {
      queryParams: {
        directWorkerEmail: worker.email,
        directWorkerName: worker.displayName
      }
    });
  }

  protected onAssignWorkOrderVisible(visible: boolean): void {
    this.showAssignWorkOrder.set(visible);
    if (!visible) {
      this.closeAssignWorkOrder();
    }
  }

  protected closeAssignWorkOrder(): void {
    this.showAssignWorkOrder.set(false);
    this.assigningWorker.set(null);
    this.assignWorkOrderId.set('');
    this.assignAsLead.set(false);
    this.assignError.set('');
  }

  protected assignableWorkOrders(worker: WorkerRecord): WorkOrderRecord[] {
    return this.workOrders()
      .filter((workOrder) => !workerAssignmentClosedStatuses.has(workOrder.status))
      .filter((workOrder) => !workOrder.assignments.some((assignment) => assignment.workerId === worker.id))
      .sort((left, right) => {
        const scheduleSort = dateValue(left.scheduledStart) - dateValue(right.scheduledStart);
        return scheduleSort || left.workOrderNumber.localeCompare(right.workOrderNumber);
      });
  }

  protected scheduleOptionLabel(workOrder: WorkOrderRecord): string {
    if (!workOrder.scheduledStart) {
      return 'Unscheduled';
    }
    const start = new Date(workOrder.scheduledStart);
    const end = workOrder.scheduledEnd ? new Date(workOrder.scheduledEnd) : null;
    const startLabel = start.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const endLabel = end?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
  }

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected async assignSelectedWorkOrder(): Promise<void> {
    const worker = this.assigningWorker();
    const workOrder = this.selectedAssignableWorkOrder();
    if (!worker || !workOrder || this.assignSaving()) {
      return;
    }

    this.assignSaving.set(true);
    this.assignError.set('');
    try {
      const request = this.workOrderAssignmentRequest(workOrder, worker);
      const updated = await firstValueFrom(this.workOrderService.update(workOrder.id, request));
      this.workOrders.update((workOrders) => workOrders.map((candidate) => candidate.id === updated.id ? updated : candidate));
      this.closeAssignWorkOrder();
    } catch (exception) {
      this.assignError.set(apiErrorMessage(exception, 'Unable to assign work order. Check service skills, schedule, or backend status.'));
    } finally {
      this.assignSaving.set(false);
    }
  }

  private workOrderAssignmentRequest(workOrder: WorkOrderRecord, worker: WorkerRecord): CreateWorkOrderRequest {
    const assignedWorkerIds = [...new Set([...workOrder.assignments.map((assignment) => assignment.workerId), worker.id])];
    const currentLeadWorkerId = workOrder.assignments.find((assignment) => assignment.leadWorker)?.workerId;
    const leadWorkerId = this.assignAsLead() || !currentLeadWorkerId ? worker.id : currentLeadWorkerId;
    return {
      propertyId: workOrder.propertyId,
      serviceTypeId: workOrder.serviceTypeId,
      title: workOrder.title,
      description: workOrder.description,
      source: workOrder.source,
      status: assignStatus(workOrder.status),
      priority: workOrder.priority,
      scheduledStart: workOrder.scheduledStart,
      scheduledEnd: workOrder.scheduledEnd,
      requesterName: workOrder.requesterName,
      requesterEmail: workOrder.requesterEmail,
      requesterPhone: workOrder.requesterPhone,
      recurrenceRule: workOrder.recurrenceRule,
      recurrenceInterval: workOrder.recurrenceInterval,
      recurrenceUntil: workOrder.recurrenceUntil,
      assignedWorkerId: assignedWorkerIds[0],
      assignedWorkerIds,
      leadWorkerId,
      materials: workOrder.materials.map((material) => ({
        id: material.id,
        inventoryItemId: material.inventoryItemId,
        description: material.description,
        quantity: material.quantity,
        unitCost: material.unitCost
      })),
      assetIds: workOrder.assets.map((asset) => asset.assetId),
      tasks: [],
      taskItems: workOrder.tasks.map((task) => ({
        id: task.id,
        label: task.label,
        assignedWorkerId: task.assignedWorkerId,
        phase: task.phase,
        required: task.required,
        notes: task.notes
      })),
      allowAvailabilityOverride: true,
      allowAvailabilityOverrideReason: `Assigned from worker profile to ${worker.displayName}`
    };
  }

  protected openLeaveDialog(worker: WorkerRecord): void {
    const today = localDateInput(new Date());
    this.leaveWorker.set(worker);
    this.leaveForm = {
      leaveStartDate: worker.leaveStartDate || today,
      leaveEndDate: worker.leaveEndDate || worker.leaveStartDate || today,
      leaveReason: worker.leaveReason || ''
    };
    this.leaveError.set('');
    this.showLeaveDialog.set(true);
  }

  protected onLeaveVisible(visible: boolean): void {
    this.showLeaveDialog.set(visible);
    if (!visible) {
      this.closeLeaveDialog();
    }
  }

  protected closeLeaveDialog(): void {
    this.showLeaveDialog.set(false);
    this.leaveWorker.set(null);
    this.leaveError.set('');
    this.leaveForm = {
      leaveStartDate: '',
      leaveEndDate: '',
      leaveReason: ''
    };
  }

  protected async markOnLeave(): Promise<void> {
    const worker = this.leaveWorker();
    if (!worker || this.leaveSaving()) {
      return;
    }
    if (!this.leaveForm.leaveStartDate || !this.leaveForm.leaveEndDate) {
      this.leaveError.set('Leave start and end dates are required.');
      return;
    }
    if (this.leaveForm.leaveEndDate < this.leaveForm.leaveStartDate) {
      this.leaveError.set('Leave end date must be on or after leave start date.');
      return;
    }
    this.leaveSaving.set(true);
    this.leaveError.set('');
    try {
      const updated = await this.updateStatus(worker, 'ON_LEAVE', {
        leaveStartDate: this.leaveForm.leaveStartDate,
        leaveEndDate: this.leaveForm.leaveEndDate,
        leaveReason: this.leaveForm.leaveReason.trim() || undefined
      });
      if (!updated) {
        this.leaveError.set('Unable to mark worker on leave.');
        return;
      }
      this.statusFilter.set('ON_LEAVE');
      this.closeLeaveDialog();
    } finally {
      this.leaveSaving.set(false);
    }
  }

  async saveWorker(request: CreateWorkerRequest): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const editingWorker = this.editingWorker();
      const worker = editingWorker
        ? await firstValueFrom(this.workerManagementService.update(editingWorker.id, request))
        : await firstValueFrom(this.workerManagementService.create(request));
      this.workers.update((workers) => [worker, ...workers.filter((candidate) => candidate.id !== worker.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.onboardingForm?.reset();
      this.showCreate.set(false);
      this.editingWorker.set(null);
    } catch {
      this.error.set('Unable to save worker. Check duplicate employee number, required fields, or backend status.');
    } finally {
      this.saving.set(false);
    }
  }

  protected openAppLogin(worker: WorkerRecord): void {
    if (!this.canManageAppLogins()) {
      this.error.set(this.access.workerLoginDeniedMessage);
      return;
    }
    this.selectedLoginWorker.set(worker);
    this.showAppLogin.set(true);
  }

  protected async createAppLogin(request: CreateTenantUserRequest | UpdateTenantUserRequest): Promise<void> {
    if (!this.canManageAppLogins()) {
      this.error.set(this.access.workerLoginDeniedMessage);
      return;
    }
    if (this.loginSaving()) {
      return;
    }
    this.loginSaving.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.tenantUserService.create(request as CreateTenantUserRequest));
      await this.refreshWorkers();
      this.showAppLogin.set(false);
      this.selectedLoginWorker.set(null);
    } catch {
      this.error.set('Unable to create worker app login. Check email, temporary password, or existing user link.');
    } finally {
      this.loginSaving.set(false);
    }
  }

  private async refreshWorkers(): Promise<void> {
    this.workers.set(await firstValueFrom(this.workerManagementService.list()));
  }

  protected async updateStatus(worker: WorkerRecord, status: string, patch: Partial<UpdateWorkerStatusRequest> = {}): Promise<WorkerRecord | null> {
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.workerManagementService.updateStatus(worker.id, { status, ...patch }));
      this.workers.update((workers) => [updated, ...workers.filter((candidate) => candidate.id !== updated.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      return updated;
    } catch {
      this.error.set('Unable to update worker status.');
      return null;
    }
  }

  protected async delete(worker: WorkerRecord): Promise<void> {
    if (!confirm(`Delete ${worker.displayName}? Workers with work history should be deactivated or terminated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.workerManagementService.delete(worker.id));
      this.workers.update((workers) => workers.filter((candidate) => candidate.id !== worker.id));
    } catch {
      this.error.set('Unable to delete worker. Deactivate or terminate workers that already have work history.');
    }
  }

  protected assignEquipment(worker: WorkerRecord): void {
    void this.router.navigate(['/inventory'], {
      queryParams: {
        assignedWorkerId: worker.id,
        assignedWorkerName: worker.displayName
      }
    });
  }
}

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function assignStatus(status: WorkOrderStatus): WorkOrderStatus {
  return ['DRAFT', 'PENDING', 'TO_DO', 'CREATED', 'SCHEDULED'].includes(status) ? 'ASSIGNED' : status;
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (typeof exception === 'object' && exception !== null && 'error' in exception) {
    const body = (exception as { error?: { error?: { message?: unknown } } }).error;
    const message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    return message || fallback;
  }
  return fallback;
}

const workerAssignmentClosedStatuses = new Set<WorkOrderStatus>([
  'PENDING_COMPLETION',
  'COMPLETED',
  'APPROVED',
  'CUSTOMER_NOTIFIED',
  'INVOICED',
  'PAID',
  'CANCELLED'
]);
