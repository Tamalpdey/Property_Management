import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { WorkOrderRecord } from '@lorne/contracts';
import { TenantAnalytics, TenantAnalyticsService } from '../analytics/services/tenant-analytics.service';
import {
  actualMinutes,
  closedReportStatuses,
  completedReportStatuses,
  dateRangeLabel,
  statusLabel,
  workOrdersInDateRange
} from '../../../../../packages/lorne-contracts/src/lib/report-generation';

interface ReportBucket {
  label: string;
  count: number;
}

@Component({
  selector: 'report-total',
  standalone: true,
  template: `
    <article class="h-full min-h-20 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-0.5 text-xl font-black text-slate-950">{{ value() }}</p>
      <p class="text-xs font-semibold text-slate-500">{{ detail() }}</p>
    </article>
  `
})
export class ReportTotalComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number | string>();
  readonly detail = input.required<string>();
}

@Component({
  selector: 'report-panel',
  standalone: true,
  template: `
    <article class="flex h-full min-h-56 flex-col rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div class="flex items-start justify-between gap-2">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ eyebrow() }}</p>
          <h2 class="mt-0.5 text-base font-black text-slate-950">{{ title() }}</h2>
        </div>
        <ng-content select="[panelAction]" />
      </div>
      <div class="mt-2 grid flex-1 content-start gap-1.5">
        <ng-content />
      </div>
    </article>
  `
})
export class ReportPanelComponent {
  readonly title = input.required<string>();
  readonly eyebrow = input.required<string>();
}

@Component({
  selector: 'bar-row',
  standalone: true,
  template: `
    <div>
      <div class="mb-1 flex items-center justify-between gap-2 text-xs">
        <span class="font-bold capitalize text-slate-700">{{ label() }}</span>
        <span class="font-black text-slate-950">{{ value() }}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full bg-teal-500" [style.width.%]="(value() / max()) * 100"></div>
      </div>
    </div>
  `
})
export class BarRowComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
}

@Component({
  selector: 'money-card',
  standalone: true,
  template: `
    <div class="h-full rounded-lg px-2.5 py-1.5" [class.bg-amber-50]="tone() === 'amber'" [class.bg-teal-50]="tone() === 'teal'" [class.bg-blue-50]="tone() === 'blue'" [class.bg-red-50]="tone() === 'red'">
      <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-0.5 text-lg font-black text-slate-950">{{ display(amount()) }}</p>
      <p class="text-xs font-semibold text-slate-500">{{ detail() }}</p>
    </div>
  `
})
export class MoneyCardComponent {
  readonly label = input.required<string>();
  readonly amount = input.required<number>();
  readonly detail = input.required<string>();
  readonly tone = input.required<'amber' | 'teal' | 'blue' | 'red'>();

  display(value: number): string {
    if (this.label() === 'Overdue') {
      return String(value);
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
}

@Component({
  selector: 'empty-report',
  standalone: true,
  template: `<p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">{{ label() }}</p>`
})
export class EmptyReportComponent {
  readonly label = input.required<string>();
}

@Component({
  selector: 'lorne-reports-page',
  standalone: true,
  imports: [BarRowComponent, ButtonModule, DatePipe, EmptyReportComponent, FormsModule, MoneyCardComponent, ReportPanelComponent, ReportTotalComponent, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-2.5">
      <div class="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Analytics" severity="info" />
            <h1 class="text-lg font-bold text-slate-950 md:text-xl">Reports</h1>
            @if (analytics(); as data) {
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Updated {{ data.generatedAt | date:'MMM d, h:mm a' }}</span>
            }
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      @if (analytics(); as data) {
        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Snapshot filters</p>
              <h2 class="text-base font-black text-slate-950">Operational report summary</h2>
              <p class="mt-0.5 text-xs font-semibold text-slate-500">{{ dateRangeLabel(snapshotDateFrom, snapshotDateTo) || 'Showing all available work orders' }}</p>
            </div>
            <div class="grid gap-2 sm:grid-cols-[10rem_10rem_auto]">
              <label class="block">
                <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">From</span>
                <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="snapshotDateFrom" [(ngModel)]="snapshotDateFrom" />
              </label>
              <label class="block">
                <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">To</span>
                <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="snapshotDateTo" [(ngModel)]="snapshotDateTo" />
              </label>
              <button pButton type="button" severity="secondary" icon="pi pi-filter-slash" label="Reset" (click)="resetSnapshotDates()"></button>
            </div>
          </div>
        </section>

        <div class="grid items-stretch gap-2.5 md:grid-cols-4 xl:grid-cols-6">
          <report-total label="Owners" [value]="data.owners.length" detail="Portfolio records" />
          <report-total label="Properties" [value]="data.properties.length" detail="Managed locations" />
          <report-total label="Workers" [value]="data.workers.length" detail="All field profiles" />
          <report-total label="Work orders" [value]="snapshotWorkOrders(data).length" detail="Matching date filters" />
          <report-total label="Completed" [value]="snapshotCompletedCount(data)" detail="Completed or later" />
          <report-total label="Actual hours" [value]="snapshotActualHours(data)" detail="Worker field time" />
        </div>

        <section class="grid items-stretch gap-2.5 xl:grid-cols-2">
          <report-panel title="Work order status" eyebrow="Operations">
            @for (bucket of snapshotStatusBuckets(data); track bucket.label) {
              <bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(snapshotStatusBuckets(data))" />
            } @empty {
              <empty-report label="No work-order status data for this date range." />
            }
          </report-panel>

          <report-panel title="Service demand" eyebrow="Services">
            @for (bucket of snapshotServiceBuckets(data); track bucket.label) {
              <bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(snapshotServiceBuckets(data))" />
            } @empty {
              <empty-report label="No service demand for this date range." />
            }
          </report-panel>

          <report-panel title="Finance snapshot" eyebrow="Revenue">
            <span panelAction class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ snapshotInvoiceCount(data) }} linked</span>
            <div class="grid gap-2 sm:grid-cols-2">
              <money-card label="Receivables" [amount]="data.finance.receivables" detail="Draft, sent, partially paid" tone="amber" />
              <money-card label="Paid" [amount]="data.finance.paidTotal" detail="Collected invoices" tone="teal" />
              <money-card label="Draft" [amount]="data.finance.draftTotal" detail="Not sent yet" tone="blue" />
              <money-card label="Overdue" [amount]="data.finance.overdueCount" detail="Invoice count" tone="red" />
            </div>
            <div class="mt-1">
              <a pButton routerLink="/invoices" type="button" icon="pi pi-file-edit" label="Open invoices" class="no-underline"></a>
            </div>
          </report-panel>

          <report-panel title="Worker load" eyebrow="People">
            <div class="grid gap-2">
              @for (worker of data.workerLoad.slice(0, 8); track worker.workerId) {
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="font-black text-slate-950">{{ worker.workerName }}</p>
                    <span class="rounded-full bg-white px-2 py-1 text-xs font-black text-teal-700">{{ worker.activeJobs }} active</span>
                  </div>
                  <p class="mt-0.5 text-xs font-semibold text-slate-500">{{ worker.status.toLowerCase().replaceAll('_', ' ') }} · {{ worker.scheduledToday }} today</p>
                </div>
              } @empty {
                <empty-report label="No active worker load." />
              }
            </div>
          </report-panel>

          <report-panel title="Portfolio coverage" eyebrow="Properties">
            <div class="grid gap-2">
              @for (owner of topOwners(data).slice(0, 8); track owner.id) {
                <div class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                  <div><p class="font-black text-slate-950">{{ owner.displayName }}</p><p class="text-xs font-semibold text-slate-500">{{ owner.email || owner.billingEmail || 'No email' }}</p></div>
                  <span class="rounded-full bg-white px-2 py-1 text-xs font-black text-teal-700">{{ owner.propertyCount }} properties</span>
                </div>
              } @empty {
                <empty-report label="No owners loaded." />
              }
            </div>
          </report-panel>

          <report-panel title="Stock and tool exceptions" eyebrow="Inventory">
            <div class="grid gap-2">
              <p class="rounded-lg bg-amber-50 px-2.5 py-1.5 text-sm font-semibold text-amber-800">{{ data.lowInventory.length }} low-stock inventory item(s)</p>
              <p class="rounded-lg bg-blue-50 px-2.5 py-1.5 text-sm font-semibold text-blue-800">{{ data.unassignedAssets.length }} active tool/equipment item(s) not assigned to a worker</p>
            </div>
          </report-panel>
        </section>
      }
    </section>
  `
})
export class ReportsPageComponent {
  private readonly analyticsService = inject(TenantAnalyticsService);
  protected readonly analytics = signal<TenantAnalytics | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected snapshotDateFrom = '';
  protected snapshotDateTo = '';

  protected readonly dateRangeLabel = dateRangeLabel;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.analytics.set(await firstValueFrom(this.analyticsService.overview()));
    } catch {
      this.error.set('Unable to load reports.');
    } finally {
      this.loading.set(false);
    }
  }

  protected resetSnapshotDates(): void {
    this.snapshotDateFrom = '';
    this.snapshotDateTo = '';
  }

  protected snapshotWorkOrders(data: TenantAnalytics): WorkOrderRecord[] {
    return workOrdersInDateRange(data.workOrders, this.snapshotDateFrom, this.snapshotDateTo);
  }

  protected snapshotStatusBuckets(data: TenantAnalytics): ReportBucket[] {
    return countBuckets(this.snapshotWorkOrders(data).map((workOrder) => statusLabel(workOrder.status)));
  }

  protected snapshotServiceBuckets(data: TenantAnalytics): ReportBucket[] {
    return countBuckets(this.snapshotWorkOrders(data).map((workOrder) => workOrder.serviceName || 'General service')).slice(0, 8);
  }

  protected snapshotCompletedCount(data: TenantAnalytics): number {
    return this.snapshotWorkOrders(data).filter((workOrder) => completedReportStatuses.has(workOrder.status)).length;
  }

  protected snapshotOpenCount(data: TenantAnalytics): number {
    return this.snapshotWorkOrders(data).filter((workOrder) => !closedReportStatuses.has(workOrder.status)).length;
  }

  protected snapshotInvoiceCount(data: TenantAnalytics): number {
    const workOrderIds = new Set(this.snapshotWorkOrders(data).map((workOrder) => workOrder.id));
    return data.invoices.filter((invoice) => invoice.workOrderId && workOrderIds.has(invoice.workOrderId)).length;
  }

  protected snapshotActualHours(data: TenantAnalytics): number {
    const minutes = this.snapshotWorkOrders(data)
      .reduce((total, workOrder) => total + actualMinutes(workOrder, 'PROPERTY', workOrder.propertyId), 0);
    return Math.round((minutes / 60) * 10) / 10;
  }

  protected maxCount(buckets: Array<{ count: number }>): number {
    return Math.max(1, ...buckets.map((bucket) => bucket.count));
  }

  protected topOwners(data: TenantAnalytics) {
    return [...data.owners].sort((left, right) => right.propertyCount - left.propertyCount || left.displayName.localeCompare(right.displayName));
  }
}

function countBuckets(labels: string[]): ReportBucket[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}
