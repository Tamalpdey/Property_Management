import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { CountBucket, TenantAnalytics, TenantAnalyticsService, TenantMetricSummary } from '../analytics/services/tenant-analytics.service';
import { TenantMetricCardComponent } from './components/tenant-metric-card.component';

@Component({
  selector: 'queue-card',
  standalone: true,
  template: `
    <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-1 text-2xl font-black" [class.text-teal-700]="tone() === 'teal'" [class.text-amber-700]="tone() === 'amber'" [class.text-blue-700]="tone() === 'blue'">{{ count() }}</p>
      <p class="text-xs font-semibold text-slate-500">{{ detail() }}</p>
    </div>
  `
})
export class QueueCardComponent {
  readonly label = input.required<string>();
  readonly count = input.required<number>();
  readonly detail = input.required<string>();
  readonly tone = input.required<TenantMetricSummary['tone']>();
}

@Component({
  selector: 'dashboard-panel',
  standalone: true,
  template: `
    <article class="flex h-full min-h-64 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex min-h-12 items-start justify-between gap-2">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ eyebrow() }}</p>
          <h2 class="mt-1 text-lg font-black text-slate-950">{{ title() }}</h2>
        </div>
        @if (badge()) {
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ badge() }}</span>
        }
      </div>
      <div class="mt-3 flex flex-1 flex-col justify-center">
        <ng-content />
      </div>
    </article>
  `
})
export class DashboardPanelComponent {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly badge = input<string>('');
}

@Component({
  selector: 'status-donut',
  standalone: true,
  template: `
    <div class="grid flex-1 gap-3 sm:grid-cols-[7.5rem_1fr] sm:items-center">
      <div class="relative mx-auto h-28 w-28 rounded-full" [style.background]="background()">
        <div class="absolute inset-4 grid place-items-center rounded-full bg-white text-center shadow-inner">
          <p class="text-xl font-black text-slate-950">{{ total() }}</p>
          <p class="text-[0.65rem] font-black uppercase tracking-wide text-slate-500">orders</p>
        </div>
      </div>
      <div class="grid content-center gap-2">
        @for (bucket of buckets().slice(0, 6); track bucket.label) {
          <div class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-700">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="color($index)"></span>
              <span class="truncate capitalize">{{ bucket.label }}</span>
            </span>
            <span class="text-sm font-black text-slate-950">{{ bucket.count }}</span>
          </div>
        } @empty {
          <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders yet.</p>
        }
      </div>
    </div>
  `
})
export class StatusDonutComponent {
  readonly buckets = input.required<CountBucket[]>();

  total(): number {
    return this.buckets().reduce((total, bucket) => total + bucket.count, 0);
  }

  background(): string {
    const total = this.total();
    if (total <= 0) {
      return '#e5e7eb';
    }
    let cursor = 0;
    const parts = this.buckets().map((bucket, index) => {
      const start = cursor;
      cursor += (bucket.count / total) * 100;
      return `${this.color(index)} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  }

  color(index: number): string {
    return ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#475569'][index % 6];
  }
}

@Component({
  selector: 'chart-bar-row',
  standalone: true,
  template: `
    <div>
      <div class="mb-1 flex items-center justify-between gap-2 text-xs">
        <span class="truncate font-bold capitalize text-slate-700">{{ label() }}</span>
        <span class="font-black text-slate-950">{{ value() }}</span>
      </div>
      <div class="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-full rounded-full"
          [class.bg-teal-500]="tone() === 'teal'"
          [class.bg-blue-500]="tone() === 'blue'"
          [class.bg-amber-500]="tone() === 'amber'"
          [style.width.%]="width()"
        ></div>
      </div>
    </div>
  `
})
export class ChartBarRowComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  readonly tone = input<TenantMetricSummary['tone']>('teal');

  width(): number {
    return Math.max(4, Math.min(100, (this.value() / Math.max(1, this.max())) * 100));
  }
}

@Component({
  selector: 'finance-bar',
  standalone: true,
  template: `
    <div class="rounded-lg bg-slate-50 px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
        <p class="text-sm font-black text-slate-950">{{ currency(amount()) }}</p>
      </div>
      <div class="mt-2 h-2 overflow-hidden rounded-full bg-white">
        <div
          class="h-full rounded-full"
          [class.bg-amber-500]="tone() === 'amber'"
          [class.bg-blue-500]="tone() === 'blue'"
          [class.bg-teal-500]="tone() === 'teal'"
          [style.width.%]="width()"
        ></div>
      </div>
    </div>
  `
})
export class FinanceBarComponent {
  readonly label = input.required<string>();
  readonly amount = input.required<number>();
  readonly max = input.required<number>();
  readonly tone = input<TenantMetricSummary['tone']>('teal');

  width(): number {
    return this.amount() <= 0 ? 0 : Math.max(4, Math.min(100, (this.amount() / Math.max(1, this.max())) * 100));
  }

  currency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  }
}

@Component({
  selector: 'lorne-dashboard',
  standalone: true,
  imports: [ButtonModule, ChartBarRowComponent, DashboardPanelComponent, DatePipe, FinanceBarComponent, QueueCardComponent, RouterLink, StatusDonutComponent, TagModule, TenantMetricCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 text-white shadow-lg">
        <div class="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div class="min-w-0">
            <p-tag value="Tenant workspace" severity="info" />
            <h1 class="mt-2 text-2xl font-bold leading-tight md:text-3xl">Property operations command board</h1>
            @if (analytics(); as data) {
              <p class="mt-1 text-sm font-semibold text-slate-300">Updated {{ data.generatedAt | date:'MMM d, h:mm a' }}</p>
            }
          </div>
          <div class="flex flex-wrap gap-2">
            <a pButton routerLink="/work-orders" type="button" severity="secondary" icon="pi pi-plus" label="Work order" class="no-underline"></a>
            <button pButton type="button" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      @if (analytics(); as data) {
        <div class="grid gap-3 md:grid-cols-3">
          @for (metric of data.metrics; track metric.label) {
            <lorne-tenant-metric-card [metric]="metric" />
          }
        </div>

        <section class="grid items-stretch gap-3 xl:grid-cols-[1fr_1fr_1fr]">
          <dashboard-panel eyebrow="Work mix" title="Status distribution" [badge]="data.workOrders.length + ' total'">
            <status-donut [buckets]="data.statusBuckets" />
          </dashboard-panel>

          <dashboard-panel eyebrow="Demand" title="Top services" [badge]="data.serviceBuckets.length + ' services'">
            <div class="grid gap-3">
              @for (bucket of data.serviceBuckets.slice(0, 6); track bucket.label) {
                <chart-bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(data.serviceBuckets)" tone="blue" />
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No service demand yet.</p>
              }
            </div>
          </dashboard-panel>

          <dashboard-panel eyebrow="Finance" title="Revenue exposure" [badge]="data.finance.overdueCount + ' overdue'">
            <div class="grid gap-2">
              <finance-bar label="Receivables" [amount]="data.finance.receivables" [max]="financeMax(data)" tone="amber" />
              <finance-bar label="Draft" [amount]="data.finance.draftTotal" [max]="financeMax(data)" tone="blue" />
              <finance-bar label="Sent" [amount]="data.finance.sentTotal" [max]="financeMax(data)" tone="blue" />
              <finance-bar label="Paid" [amount]="data.finance.paidTotal" [max]="financeMax(data)" tone="teal" />
            </div>
          </dashboard-panel>
        </section>

        <section class="grid gap-3 xl:grid-cols-[1.35fr_.9fr]">
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Operations queue</p>
                <h2 class="text-lg font-black text-slate-950">Today and review work</h2>
              </div>
              <a pButton routerLink="/schedule" type="button" text icon="pi pi-calendar" label="Schedule" class="no-underline"></a>
            </div>
            <div class="mt-3 grid gap-2 md:grid-cols-3">
              <queue-card label="Today" [count]="data.todayWork.length" detail="Scheduled jobs" tone="teal" />
              <queue-card label="Review" [count]="data.pendingReview.length" detail="Pending completion" tone="amber" />
              <queue-card label="Invoice" [count]="data.readyToInvoice.length" detail="Approved, not invoiced" tone="blue" />
            </div>
            <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
              <table class="w-full min-w-[42rem] border-collapse text-sm">
                <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr><th class="px-3 py-2">Work order</th><th class="px-3 py-2">Property</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Schedule</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (workOrder of priorityWork(data).slice(0, 7); track workOrder.id) {
                    <tr>
                      <td class="px-3 py-2"><p class="font-black text-slate-950">{{ workOrder.workOrderNumber }}</p><p class="text-xs text-slate-500">{{ workOrder.title }}</p></td>
                      <td class="px-3 py-2"><p class="font-semibold text-teal-700">{{ workOrder.propertyName }}</p><p class="text-xs text-slate-500">{{ workOrder.ownerName }}</p></td>
                      <td class="px-3 py-2"><p-tag [value]="statusLabel(workOrder.status)" [severity]="workOrderSeverity(workOrder.status)" /></td>
                      <td class="px-3 py-2 text-slate-600">{{ workOrder.scheduledStart ? (workOrder.scheduledStart | date:'MMM d, h:mm a') : 'Unscheduled' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No urgent work waiting.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <aside class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker load</p>
                  <h2 class="mt-1 text-lg font-black text-slate-950">Active assignments</h2>
                </div>
                <a pButton routerLink="/workers" type="button" text icon="pi pi-users" label="Workers" class="no-underline"></a>
              </div>
              <div class="mt-2 grid gap-2">
                @for (worker of data.workerLoad.slice(0, 6); track worker.workerId) {
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <div class="flex items-center justify-between gap-2">
                      <p class="font-black text-slate-950">{{ worker.workerName }}</p>
                      <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ worker.status.toLowerCase().replaceAll('_', ' ') }}</span>
                    </div>
                    <p class="mt-1 text-xs font-semibold text-slate-500">{{ worker.activeJobs }} active jobs · {{ worker.scheduledToday }} today</p>
                    <div class="mt-2">
                      <chart-bar-row label="Load" [value]="worker.activeJobs" [max]="workerLoadMax(data)" tone="teal" />
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No active workers.</p>
                }
              </div>
            </div>

            <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Inventory risk</p>
              <div class="mt-2 grid gap-2">
                @for (item of data.lowInventory.slice(0, 5); track item.id) {
                  <div class="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <div><p class="font-black text-slate-950">{{ item.name }}</p><p class="text-xs font-semibold text-slate-500">{{ item.storageLocation || 'No location' }}</p></div>
                    <p class="text-sm font-black text-amber-700">{{ item.quantityOnHand }} {{ item.unit }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg bg-teal-50 px-3 py-3 text-sm font-semibold text-teal-800">No low-stock items.</p>
                }
              </div>
            </div>
          </aside>
        </section>
      } @else if (!loading()) {
        <p class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-10 text-center text-sm font-semibold text-slate-500">No dashboard data loaded.</p>
      }
    </section>
  `
})
export class DashboardComponent {
  private readonly analyticsService = inject(TenantAnalyticsService);
  protected readonly analytics = signal<TenantAnalytics | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      this.analytics.set(await firstValueFrom(this.analyticsService.overview()));
    } catch {
      this.error.set('Unable to load dashboard data.');
    } finally {
      this.loading.set(false);
    }
  }

  protected priorityWork(data: TenantAnalytics) {
    return [...data.pendingReview, ...data.readyToInvoice, ...data.todayWork]
      .filter((workOrder, index, list) => list.findIndex((candidate) => candidate.id === workOrder.id) === index)
      .sort((left, right) => statusRank(left.status) - statusRank(right.status) || dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
  }

  protected statusLabel(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected workOrderSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'PENDING_COMPLETION') {
      return 'warn';
    }
    if (status === 'APPROVED' || status === 'CUSTOMER_NOTIFIED') {
      return 'success';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  protected maxCount(buckets: CountBucket[]): number {
    return Math.max(1, ...buckets.map((bucket) => bucket.count));
  }

  protected financeMax(data: TenantAnalytics): number {
    return Math.max(1, data.finance.receivables, data.finance.draftTotal, data.finance.sentTotal, data.finance.paidTotal);
  }

  protected workerLoadMax(data: TenantAnalytics): number {
    return Math.max(1, ...data.workerLoad.map((worker) => worker.activeJobs));
  }
}

function statusRank(status: string): number {
  return { PENDING_COMPLETION: 1, APPROVED: 2, CUSTOMER_NOTIFIED: 3 }[status] ?? 9;
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}
