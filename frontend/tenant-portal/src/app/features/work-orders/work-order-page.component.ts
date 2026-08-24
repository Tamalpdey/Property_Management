import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import type {
  WorkOrderStatus,
  PropertyRecord,
  ServiceType,
  InventoryItem,
  TenantAsset,
  WorkerRecord,
  WorkOrderRecord,
  WorkOrderType,
  WorkOrderReview,
  WorkOrderAuditEntry,
  WorkOrderFieldOverrideRequest,
  WorkOrderReviewActionRequest,
  WorkOrderAssignment,
  WorkOrderLink,
  CreateWorkOrderRequest,
  SendWorkOrderOwnerEmailRequest,
  TenantSettingsRecord
} from '@lorne/contracts';
import { AssetService } from '../inventory/services/asset.service';
import { InventoryService } from '../inventory/services/inventory.service';
import { InvoiceService } from '../finance/services/invoice.service';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { WorkOrderFormComponent } from './components/work-order-form.component';
import {
  WorkOrderDateFilter,
  WorkOrderEditRequest,
  WorkOrderFormResourceTab,
  WorkOrderListComponent,
  WorkOrderListFilterChange,
  WorkOrderOverrideRequest,
  WorkOrderReviewRequest,
  WorkOrderReviewTarget,
  WorkOrderStatusFilter
} from './components/work-order-list.component';
import { WorkOrderReviewComponent } from './components/work-order-review.component';
import { WorkOrderFieldOverrideComponent, WorkOrderOverrideEvidenceUploadRequest } from './components/work-order-field-override.component';
import { maintenanceRecordPrintHtml } from './work-order-maintenance-record';
import { WorkOrderService } from './services/work-order.service';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';
import { TenantAccessService } from '../../core/services/tenant-access.service';

@Component({
  selector: 'lorne-work-order-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, TagModule, WorkOrderFieldOverrideComponent, WorkOrderFormComponent, WorkOrderListComponent, WorkOrderReviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Operations" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Work orders</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ workOrders().length }} records</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" severity="secondary" icon="pi pi-box" label="Pickup order" [disabled]="!canManageWorkOrders()" (click)="openCreate('PICKUP_DELIVERY')"></button>
            <button pButton type="button" icon="pi pi-plus" label="Add work order" [disabled]="!canManageWorkOrders()" (click)="openCreate()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-work-order-list
        [workOrders]="workOrders()"
        [loading]="workOrdersLoading()"
        [statusFilter]="statusFilter()"
        [dateFilter]="dateFilter()"
        [customFrom]="customFrom()"
        [customTo]="customTo()"
        [canManageWorkOrders]="canManageWorkOrders()"
        [canManageBilling]="canManageBilling()"
        (filtersChanged)="applyFilters($event)"
        (editWorkOrder)="openEdit($event)"
        (reviewWorkOrder)="openReview($event)"
        (generateInvoiceWorkOrder)="generateInvoiceFor($event)"
        (cancelWorkOrder)="openCancel($event)"
        (bulkAssignWorkOrders)="openBulkAssign($event)"
        (overrideWorkOrder)="openOverride($event)"
      />

      <p-dialog
        [header]="editingWorkOrder() ? 'Update work order' : 'Add work order'"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(72rem, 96vw)', height: 'min(54rem, 94vh)' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'hidden' }"
        (visibleChange)="onDialogVisible($event)"
      >
        <lorne-work-order-form
          [properties]="properties()"
          [serviceTypes]="serviceTypes()"
          [workers]="workers()"
          [workOrders]="workOrders()"
          [inventoryItems]="inventoryItems()"
          [assets]="assets()"
          [workOrder]="editingWorkOrder()"
          [initialStep]="editingStep()"
          [initialResourceTab]="editingResourceTab()"
          [initialWorkOrderType]="creatingWorkOrderType()"
          [saving]="saving()"
          [saveError]="error()"
          (createWorkOrder)="save($event)"
        />
      </p-dialog>

      <p-dialog
        header="Bulk assign and schedule"
        [modal]="true"
        [visible]="showBulkAssign()"
        [style]="{ width: 'min(74rem, 96vw)', height: 'min(50rem, 92vh)' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="onBulkAssignVisible($event)"
      >
        <form class="grid gap-3" (ngSubmit)="applyBulkAssign()">
          <div class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <p class="text-sm font-black text-teal-900">{{ bulkWorkOrders().length }} editable work orders selected</p>
            <p class="mt-0.5 text-xs font-semibold text-teal-800">Apply a shared date, status, priority, workers, and lead worker. Leave a field blank to preserve its current value.</p>
          </div>

          @if (bulkError()) {
            <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ bulkError() }}</p>
          }

          <div class="grid gap-3 lg:grid-cols-[1fr_1.25fr]">
            <div class="grid content-start gap-3">
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-2">
                <label class="block">
                  <span class="mb-1 block text-sm font-bold text-slate-700">Schedule date</span>
                  <input class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" type="date" name="bulkScheduleDate" [(ngModel)]="bulkScheduleDate" />
                </label>
                <div class="grid grid-cols-2 gap-2">
                  <label class="block">
                    <span class="mb-1 block text-sm font-bold text-slate-700">Start</span>
                    <input class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" type="time" name="bulkStartTime" [(ngModel)]="bulkStartTime" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-sm font-bold text-slate-700">End</span>
                    <input class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" type="time" name="bulkEndTime" [(ngModel)]="bulkEndTime" />
                  </label>
                </div>
                <label class="block">
                  <span class="mb-1 block text-sm font-bold text-slate-700">Status</span>
                  <select class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" name="bulkStatus" [(ngModel)]="bulkStatus">
                    <option value="">Keep current</option>
                    <option value="TO_DO">To do</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="ON_HOLD">On hold</option>
                  </select>
                </label>
                <label class="block">
                  <span class="mb-1 block text-sm font-bold text-slate-700">Priority</span>
                  <select class="w-full border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700" name="bulkPriority" [(ngModel)]="bulkPriority">
                    <option value="">Keep current</option>
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </label>
              </div>

              <label class="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                <input class="mt-1" type="checkbox" name="bulkAllowOverride" [(ngModel)]="bulkAllowOverride" />
                <span>
                  <span class="block font-black">Allow dispatch override</span>
                  <span class="mt-0.5 block text-xs leading-5">Use when operations intentionally accepts overlapping work or outside-shift scheduling. A reason is required.</span>
                </span>
              </label>
              @if (bulkAllowOverride) {
                <label class="block">
                  <span class="mb-1 block text-sm font-bold text-slate-700">Override reason <span class="text-red-600">*</span></span>
                  <textarea class="w-full border border-amber-300 px-3 py-2 text-sm font-semibold" name="bulkOverrideReason" rows="3" [(ngModel)]="bulkOverrideReason"></textarea>
                </label>
              }

              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p class="text-xs font-black uppercase tracking-wide text-slate-500">Selected work orders</p>
                <div class="max-h-52 space-y-2 overflow-y-auto pr-1">
                  @for (workOrder of bulkWorkOrders(); track workOrder.id) {
                    <div class="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <p class="text-sm font-black text-teal-700">{{ workOrder.workOrderNumber }}</p>
                      <p class="text-sm font-bold text-slate-950">{{ workOrder.title }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ workOrder.propertyName }} · {{ workOrder.serviceName || 'General service' }}</p>
                    </div>
                  }
                </div>
              </div>
            </div>

            <div class="grid content-start gap-3">
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p class="text-sm font-black text-slate-950">Workers</p>
                    <p class="text-xs font-semibold text-slate-500">Selected workers replace the current assignment on each work order.</p>
                  </div>
                  <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ bulkWorkerIds.size }} selected</span>
                </div>
                <input pInputText class="w-full" name="bulkWorkerSearch" placeholder="Search workers, skills, email, phone..." [(ngModel)]="bulkWorkerSearch" />
                <div class="max-h-[27rem] space-y-2 overflow-y-auto pr-1">
                  @for (worker of filteredBulkWorkers(); track worker.id) {
                    <label class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <input type="checkbox" [checked]="bulkWorkerIds.has(worker.id)" (change)="toggleBulkWorker(worker.id, $event)" />
                      <span class="min-w-0">
                        <span class="block truncate text-sm font-black text-slate-950">{{ worker.displayName }}</span>
                        <span class="block truncate text-xs font-semibold text-slate-500">{{ worker.email || worker.phone || 'No login contact' }} · {{ engagementLabel(worker.engagementType) }} · {{ worker.serviceSkills.length }} skills</span>
                      </span>
                      <input type="radio" name="bulkLeadWorkerId" [value]="worker.id" [disabled]="!bulkWorkerIds.has(worker.id)" [(ngModel)]="bulkLeadWorkerId" />
                    </label>
                  } @empty {
                    <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No workers match the search.</p>
                  }
                </div>
              </div>
            </div>
          </div>

          <div class="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-slate-200 bg-white/95 px-1 py-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closeBulkAssign()"></button>
            <button pButton type="submit" icon="pi pi-save" [loading]="bulkSaving()" label="Apply bulk assign"></button>
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [header]="reviewingWorkOrder() ? 'Work order review' : 'Work order'"
        [modal]="true"
        [visible]="showReview()"
        [style]="{ width: 'min(68rem, 96vw)', height: 'min(56rem, 96vh)' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="onReviewVisible($event)"
      >
        <lorne-work-order-review
          [review]="review()"
          [loading]="reviewLoading()"
          [busy]="reviewSaving()"
          [error]="reviewError()"
          [initialTab]="reviewTarget()"
          [canManageWorkOrders]="canManageWorkOrders()"
          [canManageBilling]="canManageBilling()"
          (reviewAction)="submitReviewAction($event)"
          (generateInvoice)="generateInvoice()"
          (notifyOwner)="notifyOwner($event)"
          (sendInvoiceEmail)="sendInvoiceEmail($event)"
          (printWorkOrder)="printReview()"
          (printMaintenanceRecord)="printMaintenanceRecord()"
          (openLinkedWorkOrder)="openLinkedReview($event)"
        />
      </p-dialog>

      <p-dialog
        header="Operations override"
        [modal]="true"
        [visible]="showFieldOverride()"
        [style]="{ width: 'min(78rem, 96vw)', height: 'min(58rem, 96vh)' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto', padding: '0' }"
        (visibleChange)="onFieldOverrideVisible($event)"
      >
        <lorne-work-order-field-override
          [review]="review()"
          [busy]="reviewSaving()"
          [initialTab]="overrideTarget()"
          (save)="applyFieldOverride($event)"
          (evidenceUpload)="uploadReviewEvidence($event)"
        />
      </p-dialog>

      <p-dialog
        header="Cancel work order"
        [modal]="true"
        [visible]="showCancel()"
        [style]="{ width: 'min(34rem, 92vw)' }"
        (visibleChange)="onCancelVisible($event)"
      >
        @if (cancellingWorkOrder(); as workOrder) {
          <form class="grid gap-3" (ngSubmit)="cancelWorkOrder()">
            <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
              <p class="text-sm font-bold text-slate-950">{{ workOrder.workOrderNumber }} · {{ workOrder.title }}</p>
              <p class="mt-1 text-xs font-semibold text-amber-800">Canceling releases active worker assignments and locks the work order from field execution.</p>
            </div>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Cancellation reason</span>
              <textarea class="w-full border border-slate-300 px-3 py-2" name="cancelReason" rows="4" required [(ngModel)]="cancelReason"></textarea>
            </label>
            @if (cancelError()) {
              <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ cancelError() }}</p>
            }
            <div class="flex justify-end gap-2">
              <button pButton type="button" severity="secondary" label="Keep order" (click)="closeCancel()"></button>
              <button pButton type="submit" severity="danger" icon="pi pi-ban" [loading]="cancelSaving()" label="Cancel order"></button>
            </div>
          </form>
        }
      </p-dialog>
    </section>
  `
})
export class WorkOrderPageComponent {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly propertyService = inject(PropertyService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly inventoryService = inject(InventoryService);
  private readonly assetService = inject(AssetService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly access = inject(TenantAccessService);
  @ViewChild(WorkOrderFormComponent) private workOrderForm?: WorkOrderFormComponent;

  protected readonly canManageWorkOrders = this.access.canManageWorkOrders;
  protected readonly canManageBilling = this.access.canManageBilling;
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly workOrdersLoading = signal(false);
  protected readonly statusFilter = signal<WorkOrderStatusFilter>('OPEN');
  protected readonly dateFilter = signal<WorkOrderDateFilter>('ALL');
  protected readonly customFrom = signal('');
  protected readonly customTo = signal('');
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly inventoryItems = signal<InventoryItem[]>([]);
  protected readonly assets = signal<TenantAsset[]>([]);
  protected readonly tenantSettings = signal<TenantSettingsRecord | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
  protected readonly editingWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly editingStep = signal(0);
  protected readonly editingResourceTab = signal<WorkOrderFormResourceTab>('INVENTORY');
  protected readonly creatingWorkOrderType = signal<WorkOrderType>('SERVICE');
  protected readonly showReview = signal(false);
  protected readonly reviewingWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly review = signal<WorkOrderReview | null>(null);
  protected readonly reviewTarget = signal<WorkOrderReviewTarget>('SUMMARY');
  protected readonly overrideTarget = signal<'WORKERS' | 'ACTIVITY' | 'ROUTES' | 'CHECKLIST' | 'MATERIALS' | 'EVIDENCE' | 'NOTES'>('WORKERS');
  protected readonly reviewLoading = signal(false);
  protected readonly reviewSaving = signal(false);
  protected readonly reviewError = signal('');
  protected readonly showFieldOverride = signal(false);
  protected readonly showCancel = signal(false);
  protected readonly cancellingWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly cancelSaving = signal(false);
  protected readonly cancelError = signal('');
  protected readonly showBulkAssign = signal(false);
  protected readonly bulkWorkOrders = signal<WorkOrderRecord[]>([]);
  protected readonly bulkSaving = signal(false);
  protected readonly bulkError = signal('');
  protected cancelReason = '';
  protected bulkScheduleDate = '';
  protected bulkStartTime = '09:00';
  protected bulkEndTime = '10:00';
  protected bulkStatus: '' | WorkOrderStatus = '';
  protected bulkPriority: '' | WorkOrderRecord['priority'] = '';
  protected bulkWorkerSearch = '';
  protected bulkWorkerIds = new Set<string>();
  protected bulkLeadWorkerId = '';
  protected bulkAllowOverride = false;
  protected bulkOverrideReason = '';

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [workOrders, properties, catalog, workers, inventory, assetCatalog, tenantSettings] = await Promise.all([
      firstValueFrom(this.workOrderService.list(this.currentWorkOrderFilters())),
      firstValueFrom(this.propertyService.list()),
      firstValueFrom(this.serviceCatalogService.catalog()),
      firstValueFrom(this.workerManagementService.list()),
      firstValueFrom(this.inventoryService.catalog()),
      firstValueFrom(this.assetService.catalog()),
      firstValueFrom(this.tenantSettingsService.get())
    ]);
    this.workOrders.set(workOrders);
    this.properties.set(properties);
    this.serviceTypes.set(catalog.serviceTypes);
    this.workers.set(workers.filter((worker) => worker.status === 'ACTIVE'));
    this.inventoryItems.set(inventory.items);
    this.assets.set(assetCatalog.assets.filter((asset) => asset.active));
    this.tenantSettings.set(tenantSettings);
  }

  async save(request: CreateWorkOrderRequest): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const editing = this.editingWorkOrder();
      if (editing) {
        await firstValueFrom(this.workOrderService.update(editing.id, request));
      } else {
        await firstValueFrom(this.workOrderService.create(request));
      }
      await this.loadWorkOrders();
      this.workOrderForm?.reset();
      this.editingWorkOrder.set(null);
      this.showCreate.set(false);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to save work order. Check owner, property, worker availability, materials, equipment, or backend status.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected openEdit(request: WorkOrderEditRequest): void {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    this.editingStep.set(request.step);
    this.editingResourceTab.set(request.resourceTab ?? 'INVENTORY');
    this.creatingWorkOrderType.set(request.workOrder.workOrderType || 'SERVICE');
    this.editingWorkOrder.set(request.workOrder);
    this.showCreate.set(true);
  }

  protected openCreate(workOrderType: WorkOrderType = 'SERVICE'): void {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    this.editingWorkOrder.set(null);
    this.editingStep.set(0);
    this.editingResourceTab.set('INVENTORY');
    this.creatingWorkOrderType.set(workOrderType);
    this.workOrderForm?.reset(workOrderType);
    this.showCreate.set(true);
  }

  protected async openReview(request: WorkOrderReviewRequest): Promise<void> {
    this.reviewingWorkOrder.set(request.workOrder);
    this.reviewTarget.set(request.target);
    this.showReview.set(true);
    await this.loadReview(request.workOrder.id);
  }

  protected async openOverride(request: WorkOrderOverrideRequest): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    this.reviewingWorkOrder.set(request.workOrder);
    this.overrideTarget.set(request.target ?? 'WORKERS');
    this.showReview.set(false);
    this.showFieldOverride.set(true);
    await this.loadReview(request.workOrder.id);
  }

  protected async openLinkedReview(workOrderId: string): Promise<void> {
    this.reviewTarget.set('SUMMARY');
    await this.loadReview(workOrderId);
    const loaded = this.review()?.workOrder;
    if (loaded) {
      this.reviewingWorkOrder.set(loaded);
    }
  }

  protected async submitReviewAction(request: WorkOrderReviewActionRequest): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    try {
      const review = await firstValueFrom(this.workOrderService.reviewAction(workOrder.id, request));
      this.review.set(review);
      this.reviewingWorkOrder.set(review.workOrder);
      await this.loadWorkOrders();
    } catch (exception) {
      this.reviewError.set(apiErrorMessage(exception, 'Unable to complete review action.'));
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async applyFieldOverride(request: WorkOrderFieldOverrideRequest): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    try {
      const review = await firstValueFrom(this.workOrderService.fieldOverride(workOrder.id, request));
      this.review.set(review);
      this.reviewingWorkOrder.set(review.workOrder);
      this.showFieldOverride.set(false);
      await this.loadWorkOrders();
    } catch (exception) {
      this.reviewError.set(apiErrorMessage(exception, 'Unable to save field override.'));
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async generateInvoice(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    await this.generateInvoiceFor(workOrder);
  }

  protected async generateInvoiceFor(workOrder: WorkOrderRecord): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    this.error.set('');
    try {
      const review = await firstValueFrom(this.workOrderService.generateInvoice(workOrder.id));
      this.review.set(review);
      this.reviewingWorkOrder.set(review.workOrder);
      this.reviewTarget.set('SUMMARY');
      this.showReview.set(true);
      await this.loadWorkOrders();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to generate invoice.');
      this.reviewError.set(message);
      this.error.set(message);
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async notifyOwner(request: SendWorkOrderOwnerEmailRequest): Promise<void> {
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    this.error.set('');
    try {
      const review = await firstValueFrom(this.workOrderService.notifyOwner(workOrder.id, request));
      this.review.set(review);
      this.reviewingWorkOrder.set(review.workOrder);
      this.reviewTarget.set('COMMUNICATION');
      await this.loadWorkOrders();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to notify owner.');
      this.reviewError.set(message);
      this.error.set(message);
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async sendInvoiceEmail(invoiceId: string): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    this.error.set('');
    try {
      await firstValueFrom(this.invoiceService.sendEmail(invoiceId, {}));
      await this.loadReview(workOrder.id);
      this.reviewTarget.set('COMMUNICATION');
      await this.loadWorkOrders();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to send invoice email.');
      this.reviewError.set(message);
      this.error.set(message);
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async uploadReviewEvidence(request: WorkOrderOverrideEvidenceUploadRequest): Promise<void> {
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    this.reviewSaving.set(true);
    this.reviewError.set('');
    this.error.set('');
    try {
      const upload = await firstValueFrom(this.workOrderService.evidenceUploadUrl(workOrder.id, {
        fileName: request.file.name,
        contentType: request.file.type || (request.documentType === 'PURCHASE_RECEIPT' ? 'application/pdf' : 'image/jpeg'),
        byteSize: request.file.size,
        documentType: request.documentType,
        photoType: request.photoType
      }));
      await firstValueFrom(this.workOrderService.uploadEvidence(upload, request.file));
      const review = await firstValueFrom(this.workOrderService.evidenceAction(workOrder.id, {
        action: request.documentType === 'PURCHASE_RECEIPT' ? 'ADD_PURCHASE_RECEIPT' : 'ADD_PHOTO',
        documentId: upload.documentId,
        photoType: request.photoType,
        caption: request.caption,
        receiptAmount: request.receiptAmount,
        vendorName: request.vendorName
      }));
      this.review.set(review);
      this.reviewingWorkOrder.set(review.workOrder);
      this.overrideTarget.set('EVIDENCE');
      await this.loadWorkOrders();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to upload evidence. Check file type, size, and object storage settings.');
      this.reviewError.set(message);
      this.error.set(message);
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected openCancel(workOrder: WorkOrderRecord): void {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    this.cancellingWorkOrder.set(workOrder);
    this.cancelReason = '';
    this.cancelError.set('');
    this.showCancel.set(true);
  }

  protected openBulkAssign(workOrders: WorkOrderRecord[]): void {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    if (workOrders.length === 0) {
      this.error.set('Select at least one editable work order. Pending review, completed, invoiced, paid, and cancelled orders are locked.');
      return;
    }
    this.error.set('');
    this.bulkError.set('');
    this.bulkWorkOrders.set(workOrders);
    this.bulkScheduleDate = '';
    this.bulkStartTime = '09:00';
    this.bulkEndTime = '10:00';
    this.bulkStatus = '';
    this.bulkPriority = '';
    this.bulkWorkerSearch = '';
    this.bulkWorkerIds = new Set<string>();
    this.bulkLeadWorkerId = '';
    this.bulkAllowOverride = false;
    this.bulkOverrideReason = '';
    this.showBulkAssign.set(true);
  }

  protected onBulkAssignVisible(visible: boolean): void {
    this.showBulkAssign.set(visible);
    if (!visible) {
      this.closeBulkAssign();
    }
  }

  protected closeBulkAssign(): void {
    this.showBulkAssign.set(false);
    this.bulkWorkOrders.set([]);
    this.bulkError.set('');
    this.bulkSaving.set(false);
    this.bulkWorkerIds = new Set<string>();
    this.bulkLeadWorkerId = '';
  }

  protected filteredBulkWorkers(): WorkerRecord[] {
    const query = normalized(this.bulkWorkerSearch);
    return this.workers()
      .filter((worker) => !query || normalized([
        worker.displayName,
        worker.email,
        worker.phone,
        worker.employeeNumber,
        worker.engagementType,
        ...worker.serviceSkills.map((skill) => skill.serviceName)
      ].filter(Boolean).join(' ')).includes(query))
      .sort((left, right) => {
        const selectedCompare = Number(this.bulkWorkerIds.has(right.id)) - Number(this.bulkWorkerIds.has(left.id));
        return selectedCompare !== 0 ? selectedCompare : left.displayName.localeCompare(right.displayName);
      });
  }

  protected toggleBulkWorker(workerId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    const next = new Set(this.bulkWorkerIds);
    if (checked) {
      next.add(workerId);
      this.bulkLeadWorkerId ||= workerId;
    } else {
      next.delete(workerId);
      if (this.bulkLeadWorkerId === workerId) {
        this.bulkLeadWorkerId = [...next][0] || '';
      }
    }
    this.bulkWorkerIds = next;
  }

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected async applyBulkAssign(): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    const selected = this.bulkWorkOrders();
    if (this.bulkSaving()) {
      return;
    }
    if (selected.length === 0) {
      this.bulkError.set('Select at least one editable work order.');
      return;
    }
    if (this.bulkScheduleDate && (!this.bulkStartTime || !this.bulkEndTime)) {
      this.bulkError.set('Start and end time are required when applying a schedule date.');
      return;
    }
    if (this.bulkAllowOverride && !this.bulkOverrideReason.trim()) {
      this.bulkError.set('Override reason is required when accepting scheduling conflicts.');
      return;
    }
    if (!this.bulkScheduleDate && !this.bulkStatus && !this.bulkPriority && this.bulkWorkerIds.size === 0) {
      this.bulkError.set('Choose a schedule date, status, priority, or workers to apply.');
      return;
    }
    this.bulkSaving.set(true);
    this.bulkError.set('');
    this.error.set('');
    try {
      for (const workOrder of selected) {
        await firstValueFrom(this.workOrderService.update(workOrder.id, this.bulkAssignRequest(workOrder)));
      }
      await this.loadWorkOrders();
      this.closeBulkAssign();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to apply bulk assignment.');
      this.bulkError.set(message);
      this.error.set(message);
    } finally {
      this.bulkSaving.set(false);
    }
  }

  protected onCancelVisible(visible: boolean): void {
    this.showCancel.set(visible);
    if (!visible) {
      this.closeCancel();
    }
  }

  protected closeCancel(): void {
    this.showCancel.set(false);
    this.cancellingWorkOrder.set(null);
    this.cancelReason = '';
    this.cancelError.set('');
  }

  protected async cancelWorkOrder(): Promise<void> {
    if (!this.ensureCanManageWorkOrders()) {
      return;
    }
    const workOrder = this.cancellingWorkOrder();
    const reason = this.cancelReason.trim();
    if (!workOrder || this.cancelSaving()) {
      return;
    }
    if (!reason) {
      this.cancelError.set('Cancellation reason is required.');
      return;
    }
    this.cancelSaving.set(true);
    this.cancelError.set('');
    this.error.set('');
    try {
      await firstValueFrom(this.workOrderService.cancel(workOrder.id, { reason }));
      await this.loadWorkOrders();
      this.closeCancel();
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to cancel work order.');
      this.cancelError.set(message);
      this.error.set(message);
    } finally {
      this.cancelSaving.set(false);
    }
  }

  protected printReview(): void {
    const review = this.review();
    if (!review) {
      return;
    }
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(workOrderPrintHtml(review, this.tenantSettings()));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  protected printMaintenanceRecord(): void {
    const review = this.review();
    if (!review) {
      return;
    }
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.open();
    printWindow.document.write(maintenanceRecordPrintHtml(review, this.tenantSettings()));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  }

  protected onDialogVisible(visible: boolean): void {
    this.showCreate.set(visible);
    if (!visible) {
      this.editingWorkOrder.set(null);
      this.editingStep.set(0);
      this.editingResourceTab.set('INVENTORY');
      this.workOrderForm?.reset();
    }
  }

  protected onReviewVisible(visible: boolean): void {
    this.showReview.set(visible);
    if (!visible) {
      this.reviewingWorkOrder.set(null);
      this.review.set(null);
      this.reviewError.set('');
      this.reviewTarget.set('SUMMARY');
      this.showFieldOverride.set(false);
    }
  }

  protected onFieldOverrideVisible(visible: boolean): void {
    this.showFieldOverride.set(visible);
    if (!visible) {
      this.overrideTarget.set('WORKERS');
    }
  }

  private ensureCanManageWorkOrders(): boolean {
    if (this.canManageWorkOrders()) {
      return true;
    }
    this.error.set('Work-order changes are available to tenant admins and operations users.');
    this.reviewError.set('Work-order changes are available to tenant admins and operations users.');
    return false;
  }

  private ensureCanManageBilling(): boolean {
    if (this.canManageBilling()) {
      return true;
    }
    this.error.set('Billing actions are available to tenant admins and finance users.');
    this.reviewError.set('Billing actions are available to tenant admins and finance users.');
    return false;
  }

  protected async applyFilters(filters: WorkOrderListFilterChange): Promise<void> {
    this.statusFilter.set(filters.statusFilter);
    this.dateFilter.set(filters.dateFilter);
    this.customFrom.set(filters.customFrom ?? '');
    this.customTo.set(filters.customTo ?? '');
    await this.loadWorkOrders();
  }

  private async loadReview(workOrderId: string): Promise<void> {
    this.reviewLoading.set(true);
    this.reviewError.set('');
    try {
      this.review.set(await firstValueFrom(this.workOrderService.review(workOrderId)));
    } catch (exception) {
      this.reviewError.set(apiErrorMessage(exception, 'Unable to load work order review.'));
    } finally {
      this.reviewLoading.set(false);
    }
  }

  private async loadWorkOrders(): Promise<void> {
    this.workOrdersLoading.set(true);
    this.error.set('');
    try {
      this.workOrders.set(await firstValueFrom(this.workOrderService.list(this.currentWorkOrderFilters())));
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load work orders.'));
    } finally {
      this.workOrdersLoading.set(false);
    }
  }

  private currentWorkOrderFilters(): WorkOrderListFilterChange {
    return {
      statusFilter: this.statusFilter(),
      dateFilter: this.dateFilter(),
      customFrom: this.customFrom() || undefined,
      customTo: this.customTo() || undefined
    };
  }

  private bulkAssignRequest(workOrder: WorkOrderRecord): CreateWorkOrderRequest {
    const selectedWorkerIds = [...this.bulkWorkerIds];
    const assignedWorkerIds = selectedWorkerIds.length > 0
      ? selectedWorkerIds
      : workOrder.assignments.map((assignment) => assignment.workerId);
    const leadWorkerId = selectedWorkerIds.length > 0
      ? this.bulkLeadWorkerId || selectedWorkerIds[0]
      : workOrder.assignments.find((assignment) => assignment.leadWorker)?.workerId || assignedWorkerIds[0];
    const schedule = this.bulkScheduleDate
      ? scheduleForDateAndTime(this.bulkScheduleDate, this.bulkStartTime, this.bulkEndTime)
      : { scheduledStart: workOrder.scheduledStart, scheduledEnd: workOrder.scheduledEnd };
    const status = (this.bulkStatus || defaultBulkStatus(workOrder, Boolean(this.bulkScheduleDate), assignedWorkerIds.length > 0)) as WorkOrderStatus;
    return {
      propertyId: workOrder.propertyId,
      serviceTypeId: workOrder.serviceTypeId,
      workOrderType: workOrder.workOrderType,
      title: workOrder.title,
      description: workOrder.description,
      source: workOrder.source,
      status,
      priority: this.bulkPriority || workOrder.priority,
      scheduledStart: schedule.scheduledStart,
      scheduledEnd: schedule.scheduledEnd,
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
      allowAvailabilityOverride: this.bulkAllowOverride || undefined,
      allowAvailabilityOverrideReason: this.bulkAllowOverride ? this.bulkOverrideReason.trim() : undefined
    };
  }
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function scheduleForDateAndTime(date: string, startTime: string, endTime: string): { scheduledStart: string; scheduledEnd: string } {
  const start = new Date(`${date}T${startTime || '09:00'}:00`);
  const end = new Date(`${date}T${endTime || '10:00'}:00`);
  if (end <= start) {
    end.setTime(start.getTime() + 60 * 60 * 1000);
  }
  return { scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() };
}

function defaultBulkStatus(workOrder: WorkOrderRecord, scheduleChanged: boolean, hasWorkers: boolean): WorkOrderStatus {
  if (!scheduleChanged && !hasWorkers) {
    return workOrder.status;
  }
  if (hasWorkers) {
    return 'ASSIGNED';
  }
  if (scheduleChanged && ['DRAFT', 'PENDING', 'TO_DO'].includes(workOrder.status)) {
    return 'SCHEDULED';
  }
  return workOrder.status;
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    const message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    const fieldMessages = Array.isArray(body?.error?.fields)
      ? body.error.fields
          .map((field: { field?: string; message?: string }) => [field.field, field.message].filter(Boolean).join(': '))
          .filter(Boolean)
      : [];
    return [message, ...fieldMessages].filter(Boolean).join(' ') || fallback;
  }
  return fallback;
}

function workOrderPrintHtml(review: WorkOrderReview, settings?: TenantSettingsRecord | null): string {
  const workOrder = review.workOrder;
  const invoice = review.invoices[0];
  const workerEvents = review.auditLogs.filter((audit) => audit.action.startsWith('WORKER_'));
  const adminEvents = review.auditLogs.filter((audit) => !audit.action.startsWith('WORKER_'));
  const brand = printTenantBrand(settings);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(workOrder.workOrderNumber)} Work Order</title>
  <style>
    @page { size: letter; margin: 0.45in; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      font-family: Inter, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.35;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 24pt;
      border-bottom: 2px solid #111827;
      padding-bottom: 10pt;
      margin-bottom: 10pt;
    }
    h1 { margin: 0; font-size: 21pt; line-height: 1.05; }
    h2 {
      margin: 0 0 6pt;
      color: #0f766e;
      font-size: 9.5pt;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    p { margin: 2pt 0; }
    .eyebrow {
      margin: 0 0 3pt;
      color: #0f766e;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .brand-heading { display: flex; gap: 10pt; align-items: flex-start; }
    .brand-logo {
      width: 44pt;
      height: 34pt;
      border: 1px solid #d1d5db;
      object-fit: contain;
      padding: 2pt;
    }
    .status { min-width: 150pt; text-align: right; }
    .status strong { display: block; font-size: 12pt; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
    section {
      border: 1px solid #d1d5db;
      padding: 7pt;
      margin-bottom: 7pt;
      break-inside: auto;
    }
    .keep { break-inside: avoid; }
    .worker-block { break-inside: auto; }
    .worker-heading {
      display: flex;
      justify-content: space-between;
      gap: 12pt;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 5pt;
      margin-bottom: 6pt;
    }
    .pill {
      display: inline-block;
      border-radius: 999px;
      background: #f1f5f9;
      padding: 2pt 6pt;
      color: #334155;
      font-size: 8pt;
      font-weight: 800;
      text-transform: uppercase;
    }
    .override-note {
      background: #fffbeb;
      border: 1px solid #f59e0b;
      color: #92400e;
      font-size: 9pt;
      font-weight: 700;
      margin: 6pt 0;
      padding: 5pt 6pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 5pt 6pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f3f4f6; font-weight: 800; }
    tr { break-inside: avoid; }
    .muted { color: #4b5563; }
    .page-break { break-before: page; }
  </style>
</head>
<body>
  <header>
    <div class="brand-heading">
      ${brand.logoUrl ? `<img class="brand-logo" src="${escapeAttribute(brand.logoUrl)}" alt="${escapeAttribute(brand.name)} logo">` : ''}
      <div>
        <p class="eyebrow">${escapeHtml(brand.name)}</p>
        <h1>${escapeHtml(workOrder.workOrderNumber)}</h1>
        <p>${escapeHtml(workOrder.title)}</p>
        ${brand.legalName ? `<p class="muted">${escapeHtml(brand.legalName)}</p>` : ''}
        ${brand.address ? `<p class="muted">${escapeHtml(brand.address)}</p>` : ''}
        ${brand.contact ? `<p class="muted">${escapeHtml(brand.contact)}</p>` : ''}
      </div>
    </div>
    <div class="status">
      <strong>${escapeHtml(statusText(workOrder.status))}</strong>
      <span>${escapeHtml(formatDate(workOrder.scheduledStart) || 'Unscheduled')}</span>
    </div>
  </header>

  <div class="grid">
    <section>
      <h2>Property</h2>
      <p><strong>${escapeHtml(workOrder.propertyName)}</strong></p>
      <p>${escapeHtml(workOrder.propertyAddress)}</p>
      <p>Owner: ${escapeHtml(workOrder.ownerName)}</p>
      <p>Service: ${escapeHtml(workOrder.serviceName || 'General service')}</p>
    </section>
    <section>
      <h2>Schedule</h2>
      <p>Start: ${escapeHtml(formatDate(workOrder.scheduledStart) || 'Unscheduled')}</p>
      <p>End: ${escapeHtml(formatDate(workOrder.scheduledEnd) || 'Open')}</p>
      <p>Priority: ${escapeHtml(workOrder.priority)}</p>
      <p>Source: ${escapeHtml(statusText(workOrder.source))}</p>
    </section>
  </div>

  <section>
    <h2>Dispatch Instructions</h2>
    <p>${escapeHtml(workOrder.description || 'No dispatch instructions.')}</p>
  </section>

  <section>
    <h2>Route Stops</h2>
    ${table(['Order', 'Type', 'Stop', 'Address', 'Planned', 'Status'], workOrder.routeStops.map((stop) => [
      String(stop.stopOrder),
      statusText(stop.stopType),
      stop.name,
      stop.address || '-',
      formatDate(stop.plannedArrival) || '-',
      routeStopPrintStatus(stop)
    ]))}
  </section>

  <section>
    <h2>Linked Work Orders</h2>
    ${table(['Direction', 'Relationship', 'Work Order', 'Property', 'Status', 'Notes'], [
      ...workOrder.linkedWorkOrders.map((link) => linkedWorkOrderPrintRow(link, 'Linked to')),
      ...workOrder.linkedFromWorkOrders.map((link) => linkedWorkOrderPrintRow(link, 'Linked from'))
    ])}
  </section>

  <section>
    <h2>Assigned Workers</h2>
    ${table(['Name', 'Email', 'Role', 'Status', 'Actual timing'], workOrder.assignments.map((assignment) => [
      assignment.workerName,
      assignment.workerEmail || '-',
      assignment.leadWorker ? 'Lead' : 'Assigned',
      statusText(assignment.assignmentStatus),
      assignmentTimingPrintText(assignment)
    ]))}
    ${workOrder.assignments.some((assignment) => assignment.timingOverride) ? `<div class="override-note"><strong>Operations override applied.</strong> Corrected worker timing is highlighted in reports and audit.${workOrder.assignments.map((assignment) => assignment.timingOverride && assignment.overrideReason ? ` ${escapeHtml(assignment.workerName)}: ${escapeHtml(assignment.overrideReason)}.` : '').join('')}</div>` : ''}
  </section>

  <section>
    <h2>Checklist</h2>
    ${table(['Phase', 'Item', 'Required', 'Status'], workOrder.tasks.map((task) => [
      statusText(task.phase),
      task.label,
      task.required ? 'Yes' : 'No',
      task.completed ? 'Done' : 'Pending'
    ]))}
  </section>

  <section>
    <h2>Materials And Equipment</h2>
    ${table(['Description', 'Qty', 'Used', 'Unit Cost'], workOrder.materials.map((material) => [
      material.itemName || material.description,
      `${material.quantity} ${material.unit || ''}`.trim(),
      material.used ? 'Yes' : 'No',
      material.unitCost === undefined || material.unitCost === null ? '-' : currencyText(material.unitCost)
    ]))}
    <p class="muted">${workOrder.assets.length} tools/equipment assigned.</p>
  </section>

  <section>
    <h2>Field Notes</h2>
    ${review.fieldNotes.length === 0 ? '<p>No field notes.</p>' : table(['Worker', 'Updated', 'Note'], review.fieldNotes.map((note) => [
      note.workerName,
      formatDate(note.updatedAt),
      note.note
    ]))}
  </section>

  <section>
    <h2>Evidence And Receipts</h2>
    ${table(['Type', 'Worker', 'Caption / File', 'Captured'], review.evidence.map((item) => [
      item.documentType === 'PURCHASE_RECEIPT' ? 'Purchase receipt' : statusText(item.photoType || 'OTHER') + ' photo',
      item.createdByName || 'Field worker',
      item.caption || fileNameText(item.objectKey),
      formatDate(item.capturedAt || item.createdAt)
    ]))}
  </section>

  ${workerDetailSections(review)}

  <section class="page-break">
    <h2>Operational Timeline</h2>
    ${table(['Time', 'Worker', 'Activity', 'Details'], workerEvents.map((audit) => [
      formatDate(audit.createdAt),
      audit.actorName || printableString(audit.metadata['workerName']) || 'Worker',
      printActionLabel(audit.action),
      printAuditSummary(audit)
    ]))}
  </section>

  <section>
    <h2>Tenant/Admin Audit</h2>
    ${table(['Time', 'Actor', 'Activity', 'Details'], adminEvents.map((audit) => [
      formatDate(audit.createdAt),
      audit.actorName || audit.actorEmail || 'System',
      printActionLabel(audit.action),
      printAuditSummary(audit)
    ]))}
  </section>

  ${invoice ? `<section>
    <h2>Invoice</h2>
    <p><strong>${escapeHtml(invoice.invoiceNumber)}</strong> · ${escapeHtml(invoice.status)} · Total ${escapeHtml(currencyText(invoice.total))}</p>
    <p>Issued ${escapeHtml(invoice.issuedOn || '-')} · Due ${escapeHtml(invoice.dueOn || '-')}</p>
  </section>` : ''}
</body>
</html>`;
}

function printTenantBrand(settings?: TenantSettingsRecord | null): { name: string; legalName: string; address: string; contact: string; logoUrl: string } {
  const name = firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Property Services');
  const legalName = firstNonBlank(settings?.legalName);
  return {
    name,
    legalName: legalName && !sameText(name, legalName) ? legalName : '',
    address: joinText(', ', settings?.addressLine1, settings?.city, settings?.provinceCode, settings?.postalCode, settings?.countryCode),
    contact: firstNonBlank(settings?.billingEmail, settings?.supportEmail, settings?.phone),
    logoUrl: absoluteAssetUrl(settings?.logoUrl || '')
  };
}

function workerDetailSections(review: WorkOrderReview): string {
  if (review.workOrder.assignments.length === 0) {
    return '';
  }
  return `<section class="page-break">
    <h2>Worker Detail</h2>
    ${review.workOrder.assignments.map((assignment) => workerDetailSection(review, assignment)).join('')}
  </section>`;
}

function workerDetailSection(review: WorkOrderReview, assignment: WorkOrderAssignment): string {
  const workerEvents = review.auditLogs.filter((audit) =>
    audit.action.startsWith('WORKER_') &&
    printableWorkerMatches(assignment, {
      workerId: printableString(audit.metadata['workerId']),
      email: audit.actorEmail || printableString(audit.metadata['workerEmail']),
      name: audit.actorName || printableString(audit.metadata['workerName'])
    })
  );
  const notes = review.fieldNotes.filter((note) =>
    printableWorkerMatches(assignment, { workerId: note.workerId, email: note.workerEmail, name: note.workerName })
  );
  const evidence = review.evidence.filter((item) =>
    printableWorkerMatches(assignment, { workerId: item.workerId, email: item.createdByEmail, name: item.createdByName })
  );
  const timeEntries = review.timeEntries.filter((entry) =>
    printableWorkerMatches(assignment, { workerId: entry.workerId, name: entry.workerName })
  );
  const assignedTasks = review.workOrder.tasks.filter((task) => !task.assignedWorkerId || task.assignedWorkerId === assignment.workerId);
  const totalWorkMinutes = timeEntries
    .filter((entry) => entry.entryType !== 'SHIFT_CLOCK')
    .reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
  return `<section class="worker-block">
    <div class="worker-heading">
      <div>
        <p><strong>${escapeHtml(assignment.workerName)}</strong></p>
        <p class="muted">${escapeHtml(assignment.workerEmail || 'No email linked')}</p>
      </div>
      <div>
        <span class="pill">${escapeHtml(assignment.leadWorker ? 'Lead' : 'Assigned')}</span>
        <span class="pill">${escapeHtml(statusText(assignment.assignmentStatus))}</span>
        <span class="pill">${escapeHtml(minutesText(totalWorkMinutes))}</span>
        ${assignment.timingOverride ? '<span class="pill">Override</span>' : ''}
      </div>
    </div>
    ${assignment.timingOverride ? `<div class="override-note">Operations corrected this worker's field timing${assignment.overrideReason ? `: ${escapeHtml(assignment.overrideReason)}` : '.'}</div>` : ''}
    <div class="grid">
      <section class="keep">
        <h2>Worker Time</h2>
        ${table(['Type', 'Started', 'Ended', 'Duration'], timeEntries.map((entry) => [
          statusText(entry.entryType),
          formatDate(entry.startedAt),
          formatDate(entry.endedAt) || 'Open',
          entry.durationMinutes === undefined || entry.durationMinutes === null ? 'Open' : minutesText(entry.durationMinutes)
        ]))}
      </section>
      <section class="keep">
        <h2>Worker Checklist</h2>
        ${table(['Phase', 'Item', 'Required', 'Status'], assignedTasks.map((task) => [
          statusText(task.phase),
          task.label,
          task.required ? 'Yes' : 'No',
          task.completed ? 'Done' : 'Pending'
        ]))}
      </section>
    </div>
    <section class="keep">
      <h2>Worker Notes</h2>
      ${table(['Updated', 'Note'], notes.map((note) => [formatDate(note.updatedAt), note.note]))}
    </section>
    <section class="keep">
      <h2>Worker Evidence</h2>
      ${table(['Type', 'Caption / File', 'Captured'], evidence.map((item) => [
        item.documentType === 'PURCHASE_RECEIPT' ? 'Purchase receipt' : statusText(item.photoType || 'OTHER') + ' photo',
        item.caption || fileNameText(item.objectKey),
        formatDate(item.capturedAt || item.createdAt)
      ]))}
    </section>
    <section>
      <h2>Worker Activity</h2>
      ${table(['Time', 'Activity', 'Details'], workerEvents.map((audit) => [
        formatDate(audit.createdAt),
        printActionLabel(audit.action),
        printAuditSummary(audit)
      ]))}
    </section>
  </section>`;
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return '<p>No records.</p>';
  }
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function formatDate(value?: string): string {
  return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
}

function currencyText(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    : '$0.00';
}

function statusText(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function routeStopPrintStatus(stop: { arrivedAt?: string; completedAt?: string; skippedAt?: string }): string {
  if (stop.completedAt) {
    return `Done ${formatDate(stop.completedAt)}`;
  }
  if (stop.skippedAt) {
    return `Skipped ${formatDate(stop.skippedAt)}`;
  }
  if (stop.arrivedAt) {
    return `Arrived ${formatDate(stop.arrivedAt)}`;
  }
  return 'Open';
}

function linkedWorkOrderPrintRow(link: WorkOrderLink, direction: 'Linked to' | 'Linked from'): string[] {
  return [
    direction,
    linkedWorkOrderPrintRelationship(link, direction),
    `${link.workOrderNumber} ${link.title}`,
    link.propertyName,
    statusText(link.status),
    link.notes || '-'
  ];
}

function linkedWorkOrderPrintRelationship(link: WorkOrderLink, direction: 'Linked to' | 'Linked from'): string {
  switch (link.linkType) {
    case 'PICKUP_FOR':
      return direction === 'Linked to' ? 'pickup for' : 'pickup job';
    case 'BLOCKS':
      return direction === 'Linked to' ? 'blocks' : 'blocked by';
    case 'FOLLOWS':
      return direction === 'Linked to' ? 'follows' : 'follow-up';
    case 'SAME_RECURRENCE':
      return 'same recurrence';
    default:
      return 'related';
  }
}

function minutesText(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function fileNameText(objectKey: string): string {
  return objectKey.split('/').pop() || objectKey;
}

function printableString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim())?.trim() || '';
}

function joinText(delimiter: string, ...values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join(delimiter);
}

function absoluteAssetUrl(value: string): string {
  if (!value) {
    return '';
  }
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = normalizeCompanyName(left);
  const normalizedRight = normalizeCompanyName(right);
  return !!normalizedLeft && !!normalizedRight && (
    normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft)
  );
}

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function printableWorkerMatches(assignment: WorkOrderAssignment, candidate: { workerId?: string; email?: string; name?: string }): boolean {
  if (candidate.workerId && candidate.workerId === assignment.workerId) {
    return true;
  }
  if (candidate.email && assignment.workerEmail && candidate.email.toLowerCase() === assignment.workerEmail.toLowerCase()) {
    return true;
  }
  return Boolean(candidate.name && candidate.name === assignment.workerName);
}

function printActionLabel(action: string): string {
  if (action === 'WORK_ORDER_FIELD_OVERRIDE_APPLIED') {
    return 'Field data override';
  }
  return statusText(action)
    .replace(/^worker /, '')
    .replace(/^work order /, '')
    .replace(/^customer /, 'owner ');
}

function assignmentTimingPrintText(assignment: WorkOrderAssignment): string {
  const parts = [
    assignment.actualArrivedAt ? `Arrived ${formatDate(assignment.actualArrivedAt)}` : '',
    assignment.actualWorkStartedAt ? `Work ${formatDate(assignment.actualWorkStartedAt)}` : '',
    assignment.actualFinishedAt ? `Finished ${formatDate(assignment.actualFinishedAt)}` : '',
    assignment.actualWorkMinutes === undefined || assignment.actualWorkMinutes === null ? '' : minutesText(assignment.actualWorkMinutes)
  ].filter(Boolean);
  return `${parts.join(' | ') || '-'}${assignment.timingOverride ? ' | Operations override' : ''}`;
}

function printAuditSummary(audit: WorkOrderAuditEntry): string {
  const metadata = audit.metadata ?? {};
  const note = printableString(metadata['note']) || printableString(metadata['reason']);
  const label = printableString(metadata['label']) || printableString(metadata['taskLabel']);
  const material = printableString(metadata['itemName']) || printableString(metadata['description']);
  const status = printableString(metadata['status']) || printableString(metadata['workOrderStatus']);
  const invoice = printableString(metadata['invoiceNumber']);
  if (label) {
    return label;
  }
  if (material) {
    return material;
  }
  if (invoice) {
    return invoice;
  }
  if (status) {
    return statusText(status);
  }
  if (note) {
    return note;
  }
  return Object.entries(metadata)
    .filter(([key, value]) => !['userAgent', 'workerId', 'taskId', 'documentId', 'assetId', 'platform', 'latitude', 'longitude'].includes(key) && value !== undefined && value !== null)
    .slice(0, 3)
    .map(([key, value]) => `${statusText(key)}: ${printableValue(value)}`)
    .join('; ') || 'Recorded';
}

function printableValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map(printableValue).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !key.toLowerCase().endsWith('id'))
      .slice(0, 3)
      .map(([key, entryValue]) => `${statusText(key)} ${printableValue(entryValue)}`)
      .join(', ');
  }
  return String(value).replaceAll('_', ' ');
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string | number | boolean): string {
  return escapeHtml(value);
}
