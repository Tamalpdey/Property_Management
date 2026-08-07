import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TenantAnalytics, TenantAnalyticsService } from '../analytics/services/tenant-analytics.service';

@Component({
  selector: 'report-total',
  standalone: true,
  template: `
    <article class="h-full min-h-24 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-1 text-2xl font-black text-slate-950">{{ value() }}</p>
      <p class="text-xs font-semibold text-slate-500">{{ detail() }}</p>
    </article>
  `
})
export class ReportTotalComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly detail = input.required<string>();
}

@Component({
  selector: 'report-panel',
  standalone: true,
  template: `
    <article class="flex h-full min-h-72 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="min-h-12">
        <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ eyebrow() }}</p>
        <h2 class="mt-1 text-lg font-black text-slate-950">{{ title() }}</h2>
      </div>
      <div class="mt-3 grid flex-1 content-start gap-2">
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
    <div class="h-full rounded-lg px-3 py-2" [class.bg-amber-50]="tone() === 'amber'" [class.bg-teal-50]="tone() === 'teal'" [class.bg-blue-50]="tone() === 'blue'" [class.bg-red-50]="tone() === 'red'">
      <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-1 text-xl font-black text-slate-950">{{ display(amount()) }}</p>
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
  imports: [BarRowComponent, ButtonModule, DatePipe, EmptyReportComponent, MoneyCardComponent, ReportPanelComponent, ReportTotalComponent, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Analytics" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Reports</h1>
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
        <div class="grid items-stretch gap-3 md:grid-cols-4">
          <report-total label="Owners" [value]="data.owners.length" detail="Portfolio records" />
          <report-total label="Properties" [value]="data.properties.length" detail="Managed locations" />
          <report-total label="Workers" [value]="data.workers.length" detail="All field profiles" />
          <report-total label="Invoices" [value]="data.finance.invoiceCount" detail="Non-void records" />
        </div>

        <section class="grid items-stretch gap-3 xl:grid-cols-2">
          <report-panel title="Work order status" eyebrow="Operations">
            @for (bucket of data.statusBuckets; track bucket.label) {
              <bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(data.statusBuckets)" />
            } @empty {
              <empty-report label="No work-order status data." />
            }
          </report-panel>

          <report-panel title="Service demand" eyebrow="Services">
            @for (bucket of data.serviceBuckets; track bucket.label) {
              <bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(data.serviceBuckets)" />
            } @empty {
              <empty-report label="No service demand yet." />
            }
          </report-panel>

          <report-panel title="Finance snapshot" eyebrow="Revenue">
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

          <report-panel title="Worker utilization" eyebrow="People">
            <div class="overflow-hidden rounded-lg border border-slate-200">
              <table class="w-full min-w-[34rem] border-collapse text-sm">
                <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr><th class="px-3 py-2">Worker</th><th class="px-3 py-2">Type</th><th class="px-3 py-2 text-right">Active</th><th class="px-3 py-2 text-right">Today</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (worker of data.workerLoad.slice(0, 10); track worker.workerId) {
                    <tr>
                      <td class="px-3 py-2 font-black text-slate-950">{{ worker.workerName }}</td>
                      <td class="px-3 py-2 text-slate-600">{{ worker.status.toLowerCase().replaceAll('_', ' ') }}</td>
                      <td class="px-3 py-2 text-right font-black">{{ worker.activeJobs }}</td>
                      <td class="px-3 py-2 text-right font-black">{{ worker.scheduledToday }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No active worker load.</td></tr>
                  }
                </tbody>
              </table>
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
              <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{{ data.lowInventory.length }} low-stock inventory item(s)</p>
              <p class="rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">{{ data.unassignedAssets.length }} active tool/equipment item(s) not assigned to a worker</p>
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

  protected maxCount(buckets: Array<{ count: number }>): number {
    return Math.max(1, ...buckets.map((bucket) => bucket.count));
  }

  protected topOwners(data: TenantAnalytics) {
    return [...data.owners].sort((left, right) => right.propertyCount - left.propertyCount || left.displayName.localeCompare(right.displayName));
  }
}
