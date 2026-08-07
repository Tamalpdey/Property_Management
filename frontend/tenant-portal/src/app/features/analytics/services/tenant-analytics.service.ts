import { Injectable, inject } from '@angular/core';
import {
  InventoryItem,
  InvoiceRecord,
  PropertyOwner,
  PropertyRecord,
  TenantAsset,
  WorkOrderRecord,
  WorkerRecord
} from '@lorne/contracts';
import { forkJoin, map } from 'rxjs';
import { InvoiceService } from '../../finance/services/invoice.service';
import { AssetService } from '../../inventory/services/asset.service';
import { InventoryService } from '../../inventory/services/inventory.service';
import { PropertyOwnerService } from '../../owners/services/property-owner.service';
import { PropertyService } from '../../properties/services/property.service';
import { WorkerManagementService } from '../../workers/services/worker-management.service';
import { WorkOrderService } from '../../work-orders/services/work-order.service';

export interface TenantAnalytics {
  generatedAt: Date;
  owners: PropertyOwner[];
  properties: PropertyRecord[];
  workOrders: WorkOrderRecord[];
  workers: WorkerRecord[];
  invoices: InvoiceRecord[];
  inventoryItems: InventoryItem[];
  assets: TenantAsset[];
  metrics: TenantMetricSummary[];
  statusBuckets: CountBucket[];
  serviceBuckets: CountBucket[];
  workerLoad: WorkerLoadSummary[];
  pendingReview: WorkOrderRecord[];
  readyToInvoice: WorkOrderRecord[];
  todayWork: WorkOrderRecord[];
  overdueInvoices: InvoiceRecord[];
  lowInventory: InventoryItem[];
  unassignedAssets: TenantAsset[];
  finance: FinanceSummary;
}

export interface TenantMetricSummary {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: 'teal' | 'blue' | 'amber';
}

export interface CountBucket {
  label: string;
  count: number;
}

export interface WorkerLoadSummary {
  workerId: string;
  workerName: string;
  activeJobs: number;
  scheduledToday: number;
  status: string;
}

export interface FinanceSummary {
  receivables: number;
  draftTotal: number;
  sentTotal: number;
  paidTotal: number;
  invoiceCount: number;
  overdueCount: number;
}

@Injectable({ providedIn: 'root' })
export class TenantAnalyticsService {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly propertyService = inject(PropertyService);
  private readonly propertyOwnerService = inject(PropertyOwnerService);
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly inventoryService = inject(InventoryService);
  private readonly assetService = inject(AssetService);

  overview() {
    return forkJoin({
      workOrders: this.workOrderService.list(),
      invoices: this.invoiceService.list(),
      properties: this.propertyService.list(),
      owners: this.propertyOwnerService.list(),
      workers: this.workerManagementService.list(),
      inventory: this.inventoryService.catalog(),
      assets: this.assetService.catalog()
    }).pipe(
      map(({ workOrders, invoices, properties, owners, workers, inventory, assets }) => buildAnalytics({
        workOrders,
        invoices,
        properties,
        owners,
        workers,
        inventoryItems: inventory.items,
        assets: assets.assets
      }))
    );
  }
}

function buildAnalytics(input: {
  workOrders: WorkOrderRecord[];
  invoices: InvoiceRecord[];
  properties: PropertyRecord[];
  owners: PropertyOwner[];
  workers: WorkerRecord[];
  inventoryItems: InventoryItem[];
  assets: TenantAsset[];
}): TenantAnalytics {
  const now = new Date();
  const todayKey = dayKey(now);
  const invoiceWorkOrderIds = new Set(input.invoices.map((invoice) => invoice.workOrderId).filter(Boolean));
  const openWorkOrders = input.workOrders.filter((workOrder) => !terminalWorkOrderStatuses.has(workOrder.status));
  const pendingReview = input.workOrders.filter((workOrder) => workOrder.status === 'PENDING_COMPLETION');
  const readyToInvoice = input.workOrders.filter((workOrder) =>
    ['APPROVED', 'CUSTOMER_NOTIFIED'].includes(workOrder.status) && !invoiceWorkOrderIds.has(workOrder.id)
  );
  const todayWork = input.workOrders.filter((workOrder) => dayKey(workOrder.scheduledStart) === todayKey);
  const overdueInvoices = input.invoices.filter((invoice) =>
    invoice.dueOn && new Date(invoice.dueOn) < startOfToday(now) && !['PAID', 'VOID'].includes(invoice.status)
  );
  const lowInventory = input.inventoryItems
    .filter((item) => item.reorderLevel !== undefined && item.quantityOnHand <= (item.reorderLevel ?? 0))
    .sort((left, right) => left.quantityOnHand - right.quantityOnHand);
  const unassignedAssets = input.assets.filter((asset) => asset.active && !asset.assignedWorkerId);
  const finance = financeSummary(input.invoices);

  return {
    generatedAt: now,
    ...input,
    metrics: [
      {
        label: 'Open work',
        value: String(openWorkOrders.length),
        detail: `${pendingReview.length} pending review, ${readyToInvoice.length} ready to invoice`,
        icon: 'pi pi-briefcase',
        tone: 'teal'
      },
      {
        label: 'Portfolio',
        value: String(input.properties.length),
        detail: `${input.owners.length} owners, ${input.properties.filter((property) => property.active).length} active properties`,
        icon: 'pi pi-building',
        tone: 'blue'
      },
      {
        label: 'Receivables',
        value: currency(finance.receivables),
        detail: `${finance.overdueCount} overdue invoice(s), ${finance.invoiceCount} total`,
        icon: 'pi pi-wallet',
        tone: 'amber'
      }
    ],
    statusBuckets: bucket(input.workOrders.map((workOrder) => statusLabel(workOrder.status))),
    serviceBuckets: bucket(input.workOrders.map((workOrder) => workOrder.serviceName || 'General service')).slice(0, 8),
    workerLoad: workerLoad(input.workers, input.workOrders, todayKey),
    pendingReview,
    readyToInvoice,
    todayWork,
    overdueInvoices,
    lowInventory,
    unassignedAssets,
    finance
  };
}

function workerLoad(workers: WorkerRecord[], workOrders: WorkOrderRecord[], todayKey: string): WorkerLoadSummary[] {
  return workers
    .filter((worker) => worker.status === 'ACTIVE')
    .map((worker) => {
      const assigned = workOrders.filter((workOrder) => workOrder.assignments.some((assignment) => assignment.workerId === worker.id));
      return {
        workerId: worker.id,
        workerName: worker.displayName,
        activeJobs: assigned.filter((workOrder) => !terminalWorkOrderStatuses.has(workOrder.status)).length,
        scheduledToday: assigned.filter((workOrder) => dayKey(workOrder.scheduledStart) === todayKey).length,
        status: worker.engagementType
      };
    })
    .sort((left, right) => right.activeJobs - left.activeJobs || left.workerName.localeCompare(right.workerName));
}

function financeSummary(invoices: InvoiceRecord[]): FinanceSummary {
  const receivables = invoices
    .filter((invoice) => !['PAID', 'VOID'].includes(invoice.status))
    .reduce((total, invoice) => total + numberValue(invoice.total), 0);
  return {
    receivables,
    draftTotal: sumStatus(invoices, 'DRAFT'),
    sentTotal: sumStatus(invoices, 'SENT') + sumStatus(invoices, 'PARTIALLY_PAID'),
    paidTotal: sumStatus(invoices, 'PAID'),
    invoiceCount: invoices.filter((invoice) => invoice.status !== 'VOID').length,
    overdueCount: invoices.filter((invoice) => invoice.dueOn && new Date(invoice.dueOn) < startOfToday(new Date()) && !['PAID', 'VOID'].includes(invoice.status)).length
  };
}

function sumStatus(invoices: InvoiceRecord[], status: string): number {
  return invoices.filter((invoice) => invoice.status === status).reduce((total, invoice) => total + numberValue(invoice.total), 0);
}

function bucket(values: string[]): CountBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function dayKey(value?: Date | string): string {
  if (!value) {
    return '';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function startOfToday(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function statusLabel(status: string): string {
  return status.toLowerCase().replaceAll('_', ' ');
}

function numberValue(value: number | string): number {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function currency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

const terminalWorkOrderStatuses = new Set(['CANCELLED', 'INVOICED', 'PAID']);
