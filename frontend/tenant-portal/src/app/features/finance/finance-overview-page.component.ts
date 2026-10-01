import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { InvoiceRecord, WorkerRecord, WorkOrderRecord } from '@lorne/contracts';
import { WorkOrderService } from '../work-orders/services/work-order.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { InvoiceService } from './services/invoice.service';

interface JobCostRow {
  workOrder: WorkOrderRecord;
  revenue: number;
  laborCost: number;
  travelCost: number;
  materialCost: number;
  totalCost: number;
  profit: number;
  margin: number;
  laborMinutes: number;
  travelMinutes: number;
  billed: boolean;
  assignmentCosts: AssignmentCost[];
}

interface AssignmentCost {
  workerId: string;
  workerName: string;
  laborCost: number;
  travelCost: number;
}

interface ProfitRollupRow {
  label: string;
  revenue: number;
  laborCost: number;
  travelCost: number;
  materialCost: number;
  totalCost: number;
  profit: number;
  margin: number;
}

@Component({
  selector: 'lorne-finance-overview-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Finance" severity="success" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Finance overview</h1>
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Updated {{ generatedAt() | date:'MMM d, h:mm a' }}</span>
            </div>
          <div class="grid gap-2 sm:grid-cols-[9rem_9rem_minmax(16rem,1fr)_auto]">
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              From
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [(ngModel)]="fromDate" />
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              To
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [(ngModel)]="toDate" />
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Search
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="search" placeholder="Owner, property, work order, service" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" />
            </label>
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Load" [loading]="loading()" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      @if (workOrders()) {
        <div class="grid gap-3 md:grid-cols-4">
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Revenue</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ money(totalRevenue()) }}</p>
            <p class="text-xs font-semibold text-slate-500">Non-void invoices</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Estimated cost</p>
            <p class="mt-1 text-2xl font-black text-amber-700">{{ money(totalCost()) }}</p>
            <p class="text-xs font-semibold text-slate-500">Labor, travel, and materials</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Gross profit</p>
            <p class="mt-1 text-2xl font-black" [class.text-teal-700]="totalProfit() >= 0" [class.text-red-700]="totalProfit() < 0">{{ money(totalProfit()) }}</p>
            <p class="text-xs font-semibold text-slate-500">Revenue minus estimated cost</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Margin</p>
            <p class="mt-1 text-2xl font-black text-teal-700">{{ percent(totalMargin()) }}</p>
            <p class="text-xs font-semibold text-slate-500">Across billed work</p>
          </article>
        </div>

        <section class="grid gap-3 xl:grid-cols-[1fr_24rem]">
          <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Job costing</p>
                <h2 class="text-base font-black text-slate-950">Profitability by work order</h2>
                <p class="mt-1 text-xs font-semibold text-slate-500">Labor and travel cost use worker hourly rate with captured work minutes and map-estimated travel. Material cost uses recorded quantity and unit cost.</p>
              </div>
              <p-tag [value]="jobCostRows().length + ' jobs'" severity="info" />
            </div>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[70rem] border-collapse text-sm">
                <thead class="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-3 py-2">Work order</th>
                    <th class="px-3 py-2">Property</th>
                    <th class="px-3 py-2">Revenue</th>
                    <th class="px-3 py-2">Labor</th>
                    <th class="px-3 py-2">Travel</th>
                    <th class="px-3 py-2">Materials</th>
                    <th class="px-3 py-2">Total cost</th>
                    <th class="px-3 py-2">Profit</th>
                    <th class="px-3 py-2">Margin</th>
                    <th class="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (row of jobCostRows().slice(0, 40); track row.workOrder.id) {
                    <tr>
                      <td class="px-3 py-2">
                        <p class="font-black text-teal-700">{{ row.workOrder.workOrderNumber }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ row.workOrder.title }}</p>
                      </td>
                      <td class="px-3 py-2">
                        <p class="font-bold text-slate-800">{{ row.workOrder.propertyName }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ row.workOrder.ownerName }}</p>
                      </td>
                      <td class="px-3 py-2 font-black text-slate-950">{{ money(row.revenue) }}</td>
                      <td class="px-3 py-2">
                        <p class="font-semibold text-slate-700">{{ money(row.laborCost) }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ minutesLabel(row.laborMinutes) }}</p>
                      </td>
                      <td class="px-3 py-2">
                        <p class="font-semibold text-slate-700">{{ money(row.travelCost) }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ minutesLabel(row.travelMinutes) }}</p>
                      </td>
                      <td class="px-3 py-2 font-semibold text-slate-700">{{ money(row.materialCost) }}</td>
                      <td class="px-3 py-2 font-black text-slate-800">{{ money(row.totalCost) }}</td>
                      <td class="px-3 py-2 font-black" [class.text-teal-700]="row.profit >= 0" [class.text-red-700]="row.profit < 0">{{ money(row.profit) }}</td>
                      <td class="px-3 py-2 font-black text-slate-800">{{ percent(row.margin) }}</td>
                      <td class="px-3 py-2">
                        <p-tag [value]="row.billed ? 'billed' : 'unbilled'" [severity]="row.billed ? 'success' : 'warn'" />
                      </td>
                    </tr>
                  } @empty {
                    <tr><td colspan="10" class="px-3 py-12 text-center text-sm font-semibold text-slate-500">No work orders available for costing.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <aside class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Receivables</p>
              <div class="mt-3 grid gap-2">
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="text-sm font-bold text-slate-600">Open balance</span>
                  <strong class="text-sm text-slate-950">{{ money(receivables()) }}</strong>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="text-sm font-bold text-slate-600">Draft invoices</span>
                  <strong class="text-sm text-slate-950">{{ money(draftTotal()) }}</strong>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="text-sm font-bold text-slate-600">Sent invoices</span>
                  <strong class="text-sm text-slate-950">{{ money(sentTotal()) }}</strong>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="text-sm font-bold text-slate-600">Paid invoices</span>
                  <strong class="text-sm text-slate-950">{{ money(paidTotal()) }}</strong>
                </div>
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="text-sm font-bold text-slate-600">Overdue count</span>
                  <strong class="text-sm text-slate-950">{{ overdueCount() }}</strong>
                </div>
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Profit by service</p>
              <div class="mt-3 grid gap-2">
                @for (row of serviceProfitRows().slice(0, 5); track row.label) {
                  <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div class="flex items-center justify-between gap-3">
                      <p class="min-w-0 truncate font-black text-slate-800">{{ row.label }}</p>
                      <strong [class.text-teal-700]="row.profit >= 0" [class.text-red-700]="row.profit < 0">{{ money(row.profit) }}</strong>
                    </div>
                    <p class="mt-1 text-xs font-semibold text-slate-500">Revenue {{ money(row.revenue) }} · Margin {{ percent(row.margin) }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">No service profitability yet.</p>
                }
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Profit by worker</p>
              <div class="mt-3 grid gap-2">
                @for (row of workerProfitRows().slice(0, 5); track row.label) {
                  <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div class="flex items-center justify-between gap-3">
                      <p class="min-w-0 truncate font-black text-slate-800">{{ row.label }}</p>
                      <strong [class.text-teal-700]="row.profit >= 0" [class.text-red-700]="row.profit < 0">{{ money(row.profit) }}</strong>
                    </div>
                    <p class="mt-1 text-xs font-semibold text-slate-500">Labor {{ money(row.laborCost) }} · Travel {{ money(row.travelCost) }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg bg-slate-50 px-3 py-4 text-center text-sm font-semibold text-slate-500">No worker profitability yet.</p>
                }
              </div>
            </div>
          </aside>
        </section>
      }
    </section>
  `
})
export class FinanceOverviewPageComponent {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly workerService = inject(WorkerManagementService);
  private readonly invoiceService = inject(InvoiceService);
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly invoices = signal<InvoiceRecord[]>([]);
  protected readonly generatedAt = signal(new Date().toISOString());
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected fromDate = dateInput(firstDayOfMonth(new Date()));
  protected toDate = dateInput(lastDayOfMonth(new Date()));
  protected readonly searchTerm = signal('');
  protected readonly jobCostRows = computed(() => {
    const search = normalizeSearch(this.searchTerm());
    return buildJobCostRows(this.workOrders(), this.workers(), this.invoices())
      .filter((row) => !search || financeSearchText(row.workOrder).includes(search))
      .sort((left, right) => right.profit - left.profit);
  });
  protected readonly totalRevenue = computed(() => this.jobCostRows().reduce((total, row) => total + row.revenue, 0));
  protected readonly totalCost = computed(() => this.jobCostRows().reduce((total, row) => total + row.totalCost, 0));
  protected readonly totalProfit = computed(() => this.totalRevenue() - this.totalCost());
  protected readonly totalMargin = computed(() => this.totalRevenue() > 0 ? (this.totalProfit() / this.totalRevenue()) * 100 : 0);
  protected readonly serviceProfitRows = computed(() => rollupByService(this.jobCostRows()));
  protected readonly workerProfitRows = computed(() => rollupByWorker(this.jobCostRows()));
  protected readonly receivables = computed(() => this.invoices().filter((invoice) => invoice.status !== 'VOID').reduce((total, invoice) => total + Number(invoice.balanceDue || 0), 0));
  protected readonly draftTotal = computed(() => this.invoices().filter((invoice) => invoice.status === 'DRAFT').reduce((total, invoice) => total + Number(invoice.total || 0), 0));
  protected readonly sentTotal = computed(() => this.invoices().filter((invoice) => invoice.status === 'SENT' || invoice.status === 'PARTIALLY_PAID' || invoice.status === 'OVERDUE').reduce((total, invoice) => total + Number(invoice.total || 0), 0));
  protected readonly paidTotal = computed(() => this.invoices().filter((invoice) => invoice.status === 'PAID').reduce((total, invoice) => total + Number(invoice.total || 0), 0));
  protected readonly overdueCount = computed(() => this.invoices().filter((invoice) => invoice.status === 'OVERDUE').length);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [workOrders, workers, invoices] = await Promise.all([
        firstValueFrom(this.workOrderService.list({
          dateFilter: 'CUSTOM',
          customFrom: this.fromDate,
          customTo: this.toDate
        })),
        firstValueFrom(this.workerService.list()),
        firstValueFrom(this.invoiceService.list())
      ]);
      this.workOrders.set(workOrders);
      this.workers.set(workers);
      this.invoices.set(invoices);
      this.generatedAt.set(new Date().toISOString());
    } catch {
      this.error.set('Unable to load finance overview.');
    } finally {
      this.loading.set(false);
    }
  }

  protected money(value: number): string {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 }).format(value);
  }

  protected percent(value: number): string {
    return `${Math.round(value * 10) / 10}%`;
  }

  protected minutesLabel(minutes: number): string {
    if (minutes < 60) {
      return `${Math.round(minutes)}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = Math.round(minutes % 60);
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }
}

function buildJobCostRows(workOrders: WorkOrderRecord[], workers: WorkerRecord[], invoices: InvoiceRecord[]): JobCostRow[] {
  const workerRates = new Map(workers.map((worker) => [worker.id, Number(worker.hourlyRate || 0)]));
  const invoiceRevenueByWorkOrder = invoiceRevenue(invoices);
  return workOrders.map((workOrder) => {
    const revenue = invoiceRevenueByWorkOrder.get(workOrder.id) || 0;
    const laborMinutes = workOrder.assignments.reduce((total, assignment) => total + Number(assignment.actualWorkMinutes || 0), 0);
    const travelMinutes = workOrder.assignments.reduce((total, assignment) => total + Number(assignment.estimatedTravelMinutes || routeStopEstimate(workOrder) || 0), 0);
    const assignmentCosts = workOrder.assignments.map((assignment) => {
      const hourlyRate = workerRates.get(assignment.workerId) || 0;
      return {
        workerId: assignment.workerId,
        workerName: assignment.workerName,
        laborCost: ((assignment.actualWorkMinutes || 0) / 60) * hourlyRate,
        travelCost: ((assignment.estimatedTravelMinutes || routeStopEstimate(workOrder) || 0) / 60) * hourlyRate
      };
    });
    const laborCost = assignmentCosts.reduce((total, assignment) => total + assignment.laborCost, 0);
    const travelCost = assignmentCosts.reduce((total, assignment) => total + assignment.travelCost, 0);
    const materialCost = workOrder.materials.reduce((total, material) => total + Number(material.quantity || 0) * Number(material.unitCost || 0), 0);
    const totalCost = laborCost + travelCost + materialCost;
    const profit = revenue - totalCost;
    return {
      workOrder,
      revenue,
      laborCost,
      travelCost,
      materialCost,
      totalCost,
      profit,
      laborMinutes,
      travelMinutes,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      billed: revenue > 0,
      assignmentCosts
    };
  });
}

function routeStopEstimate(workOrder: WorkOrderRecord): number | undefined {
  return workOrder.routeStops.find((stop) => stop.estimatedTravelMinutes)?.estimatedTravelMinutes;
}

function firstDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function lastDayOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function financeSearchText(workOrder: WorkOrderRecord): string {
  return [
    workOrder.workOrderNumber,
    workOrder.title,
    workOrder.propertyName,
    workOrder.propertyAddress,
    workOrder.ownerName,
    workOrder.serviceName,
    workOrder.status,
    ...workOrder.assignments.map((assignment) => assignment.workerName)
  ].filter(Boolean).join(' ').toLowerCase();
}

function invoiceRevenue(invoices: InvoiceRecord[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const invoice of invoices.filter((item) => item.status !== 'VOID')) {
    const workOrderIds = [
      invoice.workOrderId,
      ...(invoice.workOrders || []).map((item) => item.workOrderId)
    ].filter(Boolean) as string[];
    if (workOrderIds.length === 0) {
      continue;
    }
    const revenue = Number(invoice.total || 0) / workOrderIds.length;
    for (const workOrderId of workOrderIds) {
      map.set(workOrderId, (map.get(workOrderId) || 0) + revenue);
    }
  }
  return map;
}

function rollupByService(rows: JobCostRow[]): ProfitRollupRow[] {
  const rollups = new Map<string, ProfitRollupRow>();
  for (const row of rows) {
    addRollup(rollups, row.workOrder.serviceName || row.workOrder.workOrderType || 'Uncategorized service', row);
  }
  return sortedRollups(rollups);
}

function rollupByWorker(rows: JobCostRow[]): ProfitRollupRow[] {
  const rollups = new Map<string, ProfitRollupRow>();
  for (const row of rows) {
    const assignmentCosts = row.assignmentCosts.length ? row.assignmentCosts : [{ workerId: 'unassigned', workerName: 'Unassigned', laborCost: 0, travelCost: 0 }];
    const revenueShare = row.revenue / assignmentCosts.length;
    const materialShare = row.materialCost / assignmentCosts.length;
    for (const assignment of assignmentCosts) {
      const workerRow = {
        ...row,
        revenue: revenueShare,
        laborCost: assignment.laborCost,
        travelCost: assignment.travelCost,
        materialCost: materialShare
      } as JobCostRow;
      addRollup(rollups, assignment.workerName || 'Unassigned', workerRow);
    }
  }
  return sortedRollups(rollups);
}

function addRollup(rollups: Map<string, ProfitRollupRow>, label: string, row: JobCostRow): void {
  const existing = rollups.get(label) || {
    label,
    revenue: 0,
    laborCost: 0,
    travelCost: 0,
    materialCost: 0,
    totalCost: 0,
    profit: 0,
    margin: 0
  };
  existing.revenue += row.revenue;
  existing.laborCost += row.laborCost;
  existing.travelCost += row.travelCost;
  existing.materialCost += row.materialCost;
  existing.totalCost = existing.laborCost + existing.travelCost + existing.materialCost;
  existing.profit = existing.revenue - existing.totalCost;
  existing.margin = existing.revenue > 0 ? (existing.profit / existing.revenue) * 100 : 0;
  rollups.set(label, existing);
}

function sortedRollups(rollups: Map<string, ProfitRollupRow>): ProfitRollupRow[] {
  return [...rollups.values()].sort((left, right) => right.profit - left.profit);
}
