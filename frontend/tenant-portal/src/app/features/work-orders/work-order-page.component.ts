import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { CreateWorkOrderRequest, InventoryItem, PropertyRecord, ServiceType, TenantAsset, WorkerRecord, WorkOrderRecord, WorkOrderReview, WorkOrderReviewActionRequest } from '@lorne/contracts';
import { AssetService } from '../inventory/services/asset.service';
import { InventoryService } from '../inventory/services/inventory.service';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { WorkOrderFormComponent } from './components/work-order-form.component';
import { WorkOrderEditRequest, WorkOrderFormResourceTab, WorkOrderListComponent, WorkOrderReviewRequest, WorkOrderReviewTarget } from './components/work-order-list.component';
import { WorkOrderReviewComponent } from './components/work-order-review.component';
import { WorkOrderService } from './services/work-order.service';

@Component({
  selector: 'lorne-work-order-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, TagModule, WorkOrderFormComponent, WorkOrderListComponent, WorkOrderReviewComponent],
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
          <button pButton type="button" icon="pi pi-plus" label="Add work order" (click)="openCreate()"></button>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-work-order-list
        [workOrders]="workOrders()"
        (editWorkOrder)="openEdit($event)"
        (reviewWorkOrder)="openReview($event)"
        (generateInvoiceWorkOrder)="generateInvoiceFor($event)"
      />

      <p-dialog
        [header]="editingWorkOrder() ? 'Update work order' : 'Add work order'"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(58rem, 94vw)' }"
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
          [saving]="saving()"
          [saveError]="error()"
          (createWorkOrder)="save($event)"
        />
      </p-dialog>

      <p-dialog
        [header]="reviewingWorkOrder() ? 'Work order review' : 'Work order'"
        [modal]="true"
        [visible]="showReview()"
        [style]="{ width: 'min(68rem, 96vw)' }"
        (visibleChange)="onReviewVisible($event)"
      >
        <lorne-work-order-review
          [review]="review()"
          [loading]="reviewLoading()"
          [busy]="reviewSaving()"
          [error]="reviewError()"
          [initialTab]="reviewTarget()"
          (reviewAction)="submitReviewAction($event)"
          (generateInvoice)="generateInvoice()"
          (printWorkOrder)="printReview()"
        />
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
  @ViewChild(WorkOrderFormComponent) private workOrderForm?: WorkOrderFormComponent;

  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly inventoryItems = signal<InventoryItem[]>([]);
  protected readonly assets = signal<TenantAsset[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly showCreate = signal(false);
  protected readonly editingWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly editingStep = signal(0);
  protected readonly editingResourceTab = signal<WorkOrderFormResourceTab>('INVENTORY');
  protected readonly showReview = signal(false);
  protected readonly reviewingWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly review = signal<WorkOrderReview | null>(null);
  protected readonly reviewTarget = signal<WorkOrderReviewTarget>('SUMMARY');
  protected readonly reviewLoading = signal(false);
  protected readonly reviewSaving = signal(false);
  protected readonly reviewError = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [workOrders, properties, catalog, workers, inventory, assetCatalog] = await Promise.all([
      firstValueFrom(this.workOrderService.list()),
      firstValueFrom(this.propertyService.list()),
      firstValueFrom(this.serviceCatalogService.catalog()),
      firstValueFrom(this.workerManagementService.list()),
      firstValueFrom(this.inventoryService.catalog()),
      firstValueFrom(this.assetService.catalog())
    ]);
    this.workOrders.set(workOrders);
    this.properties.set(properties);
    this.serviceTypes.set(catalog.serviceTypes);
    this.workers.set(workers.filter((worker) => worker.status === 'ACTIVE'));
    this.inventoryItems.set(inventory.items);
    this.assets.set(assetCatalog.assets.filter((asset) => asset.active));
  }

  async save(request: CreateWorkOrderRequest): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const editing = this.editingWorkOrder();
      const workOrder = editing
        ? await firstValueFrom(this.workOrderService.update(editing.id, request))
        : await firstValueFrom(this.workOrderService.create(request));
      this.workOrders.update((workOrders) => editing
        ? workOrders.map((candidate) => candidate.id === workOrder.id ? workOrder : candidate)
        : [workOrder, ...workOrders]);
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
    this.editingStep.set(request.step);
    this.editingResourceTab.set(request.resourceTab ?? 'INVENTORY');
    this.editingWorkOrder.set(request.workOrder);
    this.showCreate.set(true);
  }

  protected openCreate(): void {
    this.editingWorkOrder.set(null);
    this.editingStep.set(0);
    this.editingResourceTab.set('INVENTORY');
    this.workOrderForm?.reset();
    this.showCreate.set(true);
  }

  protected async openReview(request: WorkOrderReviewRequest): Promise<void> {
    this.reviewingWorkOrder.set(request.workOrder);
    this.reviewTarget.set(request.target);
    this.showReview.set(true);
    await this.loadReview(request.workOrder.id);
  }

  protected async submitReviewAction(request: WorkOrderReviewActionRequest): Promise<void> {
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
      this.workOrders.update((workOrders) => workOrders.map((candidate) => candidate.id === review.workOrder.id ? review.workOrder : candidate));
    } catch (exception) {
      this.reviewError.set(apiErrorMessage(exception, 'Unable to complete review action.'));
    } finally {
      this.reviewSaving.set(false);
    }
  }

  protected async generateInvoice(): Promise<void> {
    const workOrder = this.reviewingWorkOrder();
    if (!workOrder || this.reviewSaving()) {
      return;
    }
    await this.generateInvoiceFor(workOrder);
  }

  protected async generateInvoiceFor(workOrder: WorkOrderRecord): Promise<void> {
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
      this.workOrders.update((workOrders) => workOrders.map((candidate) => candidate.id === review.workOrder.id ? review.workOrder : candidate));
    } catch (exception) {
      const message = apiErrorMessage(exception, 'Unable to generate invoice.');
      this.reviewError.set(message);
      this.error.set(message);
    } finally {
      this.reviewSaving.set(false);
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
    printWindow.document.write(workOrderPrintHtml(review));
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
    }
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

function workOrderPrintHtml(review: WorkOrderReview): string {
  const workOrder = review.workOrder;
  const invoice = review.invoices[0];
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
    .status { min-width: 150pt; text-align: right; }
    .status strong { display: block; font-size: 12pt; text-transform: uppercase; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt; }
    section {
      break-inside: avoid;
      border: 1px solid #d1d5db;
      padding: 7pt;
      margin-bottom: 7pt;
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
    .muted { color: #4b5563; }
    .page-break { break-before: page; }
  </style>
</head>
<body>
  <header>
    <div>
      <p class="eyebrow">Work Order</p>
      <h1>${escapeHtml(workOrder.workOrderNumber)}</h1>
      <p>${escapeHtml(workOrder.title)}</p>
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
    <h2>Assigned Workers</h2>
    ${table(['Name', 'Role', 'Status'], workOrder.assignments.map((assignment) => [
      assignment.workerName,
      assignment.leadWorker ? 'Lead' : 'Assigned',
      statusText(assignment.assignmentStatus)
    ]))}
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
    ${review.fieldNotes.length === 0 ? '<p>No field notes.</p>' : review.fieldNotes.map((note) => `<p><strong>${escapeHtml(note.workerName)}:</strong> ${escapeHtml(note.note)}</p>`).join('')}
  </section>

  <section>
    <h2>Evidence And Receipts</h2>
    ${review.evidence.length === 0 ? '<p>No evidence uploaded.</p>' : review.evidence.map((item) => `<p>${escapeHtml(item.documentType === 'PURCHASE_RECEIPT' ? 'Purchase receipt' : statusText(item.photoType || 'OTHER') + ' photo')}: ${escapeHtml(item.caption || item.objectKey)}</p>`).join('')}
  </section>

  ${invoice ? `<section>
    <h2>Invoice</h2>
    <p><strong>${escapeHtml(invoice.invoiceNumber)}</strong> · ${escapeHtml(invoice.status)} · Total ${escapeHtml(currencyText(invoice.total))}</p>
    <p>Issued ${escapeHtml(invoice.issuedOn || '-')} · Due ${escapeHtml(invoice.dueOn || '-')}</p>
  </section>` : ''}
</body>
</html>`;
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

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
