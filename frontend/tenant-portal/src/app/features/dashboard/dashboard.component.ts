import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type { DashboardWidgetId, TenantSettingsRecord, WorkOrderRecord, WorkerClockedInTodayRecord } from '@lorne/contracts';
import { CountBucket, TenantAnalytics, TenantAnalyticsService, TenantMetricSummary } from '../analytics/services/tenant-analytics.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { TenantMetricCardComponent } from './components/tenant-metric-card.component';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';

type DashboardQueueMode = 'ATTENTION' | 'DRAFT' | 'TODAY' | 'REVIEW' | 'INVOICE';

@Component({
  selector: 'queue-card',
  standalone: true,
  template: `
    <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
      <p class="mt-0.5 text-xl font-black" [class.text-teal-700]="tone() === 'teal'" [class.text-amber-700]="tone() === 'amber'" [class.text-blue-700]="tone() === 'blue'">{{ count() }}</p>
      <p class="text-[0.82rem] font-semibold text-slate-500">{{ detail() }}</p>
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
    <article class="flex h-full min-h-44 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex min-h-10 items-start justify-between gap-2">
        <div>
          <p class="text-[0.8rem] font-black uppercase tracking-wide text-teal-700">{{ eyebrow() }}</p>
          <h2 class="mt-0.5 text-lg font-black text-slate-950">{{ title() }}</h2>
        </div>
        @if (badge()) {
          <span class="rounded-full bg-slate-100 px-2.5 py-1 text-[0.8rem] font-black text-slate-600">{{ badge() }}</span>
        }
      </div>
      <div class="mt-2 flex flex-1 flex-col">
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
    <div class="grid flex-1 gap-4 pt-1 lg:grid-cols-[16rem_1fr] lg:items-start">
      <div
        class="status-chart relative mx-auto h-60 w-60 rounded-full bg-white shadow-sm"
        (mouseleave)="hoveredIndex.set(null)"
      >
        <svg class="h-full w-full" viewBox="0 0 240 240" role="img" aria-label="Work order status distribution">
          <circle class="status-chart__track" cx="120" cy="120" r="88" [attr.stroke]="total() > 0 ? 'transparent' : '#e5e7eb'"></circle>
          @for (segment of segments(); track segment.label) {
            <circle
              class="status-chart__slice"
              cx="120"
              cy="120"
              r="88"
              fill="none"
              tabindex="0"
              [attr.stroke]="segment.color"
              [attr.stroke-dasharray]="segment.dashArray"
              [attr.stroke-dashoffset]="segment.dashOffset"
              [attr.aria-label]="segment.label + ': ' + segment.count + ' work orders, ' + segment.percent + '%'"
              [class.status-chart__slice--active]="hoveredIndex() === $index"
              (mouseenter)="hoveredIndex.set($index)"
              (focus)="hoveredIndex.set($index)"
              (blur)="hoveredIndex.set(null)"
            ></circle>
          }
        </svg>
        <div class="absolute inset-14 grid place-items-center rounded-full bg-white text-center shadow-inner">
          <div>
            <p class="text-4xl font-black leading-none text-slate-950">{{ total() }}</p>
            <p class="mt-1 text-[0.8rem] font-black uppercase tracking-wide text-slate-500">orders</p>
          </div>
        </div>
        @if (hoveredSegment(); as segment) {
          <div class="status-chart__tooltip">
            <p class="text-xs font-black uppercase tracking-wide text-slate-400">{{ segment.label }}</p>
            <p class="mt-0.5 text-lg font-black text-white">{{ segment.count }} orders</p>
            <p class="text-xs font-bold text-teal-100">{{ segment.percent }}% of current work mix</p>
          </div>
        }
      </div>
      <div class="grid max-h-64 content-start gap-x-5 gap-y-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:pt-1">
        @for (bucket of chartBuckets(); track bucket.label) {
          <div
            class="grid gap-1 rounded-md py-0.5 transition"
            [class.bg-slate-50]="hoveredIndex() === $index"
            (mouseenter)="hoveredIndex.set($index)"
            (mouseleave)="hoveredIndex.set(null)"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="flex min-w-0 items-center gap-2 text-[0.88rem] font-bold text-slate-700">
                <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="color($index)"></span>
                <span class="truncate capitalize">{{ bucket.label }}</span>
              </span>
              <span class="shrink-0 text-[0.88rem] font-black text-slate-950">{{ bucket.count }}</span>
            </div>
            <div class="flex items-center gap-2 pl-4">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div class="h-full rounded-full" [style.background]="color($index)" [style.width.%]="percent(bucket)"></div>
              </div>
              <span class="w-9 text-right text-[0.76rem] font-black text-slate-500">{{ percent(bucket) }}%</span>
            </div>
          </div>
        } @empty {
          <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders yet.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .status-chart__track {
      fill: none;
      stroke-width: 44;
    }

    .status-chart__slice {
      cursor: pointer;
      stroke-linecap: butt;
      stroke-width: 44;
      transform: rotate(-90deg);
      transform-origin: 120px 120px;
      transition: filter 160ms ease, opacity 160ms ease, stroke-width 160ms ease;
    }

    .status-chart:hover .status-chart__slice {
      opacity: 0.58;
    }

    .status-chart .status-chart__slice--active,
    .status-chart__slice:focus-visible {
      filter: drop-shadow(0 8px 14px rgba(15, 23, 42, 0.22));
      opacity: 1;
      outline: none;
      stroke-width: 50;
    }

    .status-chart__tooltip {
      animation: chartTooltipIn 140ms ease-out;
      background: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 0.5rem;
      box-shadow: 0 18px 32px rgba(15, 23, 42, 0.24);
      left: 50%;
      min-width: 10rem;
      padding: 0.55rem 0.7rem;
      pointer-events: none;
      position: absolute;
      top: -0.5rem;
      transform: translate(-50%, -100%);
      z-index: 2;
    }

    .status-chart__tooltip::after {
      border-left: 0.45rem solid transparent;
      border-right: 0.45rem solid transparent;
      border-top: 0.45rem solid #0f172a;
      content: '';
      left: 50%;
      position: absolute;
      top: 100%;
      transform: translateX(-50%);
    }

    @keyframes chartTooltipIn {
      from {
        opacity: 0;
        transform: translate(-50%, calc(-100% + 0.4rem));
      }
      to {
        opacity: 1;
        transform: translate(-50%, -100%);
      }
    }
  `]
})
export class StatusDonutComponent {
  readonly buckets = input.required<CountBucket[]>();
  readonly hoveredIndex = signal<number | null>(null);
  private readonly circumference = 2 * Math.PI * 88;

  total(): number {
    return this.buckets().reduce((total, bucket) => total + bucket.count, 0);
  }

  chartBuckets(): CountBucket[] {
    return this.buckets();
  }

  segments(): StatusChartSegment[] {
    const total = Math.max(1, this.total());
    let cursor = 0;
    return this.chartBuckets().map((bucket, index) => {
      const percent = this.percent(bucket);
      const length = (bucket.count / total) * this.circumference;
      const segment: StatusChartSegment = {
        label: bucket.label,
        count: bucket.count,
        percent,
        color: this.color(index),
        dashArray: `${Math.max(0, length - 2)} ${this.circumference}`,
        dashOffset: `${-cursor}`
      };
      cursor += length;
      return segment;
    });
  }

  color(index: number): string {
    return ['#0f766e', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#475569', '#0891b2', '#16a34a', '#c2410c', '#9333ea', '#be123c', '#334155'][index % 12];
  }

  percent(bucket: CountBucket): number {
    return Math.round((bucket.count / Math.max(1, this.total())) * 100);
  }

  hoveredSegment(): StatusChartSegment | null {
    const index = this.hoveredIndex();
    return index === null ? null : this.segments()[index] ?? null;
  }
}

@Component({
  selector: 'work-pipeline',
  standalone: true,
  template: `
    <div class="flex flex-1 flex-col justify-between gap-4 pt-1">
      <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
        @for (stage of stages(); track stage.label) {
          <div class="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
            <div class="flex items-center gap-2">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full" [style.background]="stage.color"></span>
              <p class="truncate text-[0.72rem] font-black uppercase text-slate-500">{{ stage.label }}</p>
            </div>
            <p class="mt-1 text-xl font-black leading-none text-slate-950">{{ stage.count }}</p>
            <p class="mt-1 text-[0.72rem] font-bold text-slate-500">{{ percent(stage.count) }}% of work</p>
          </div>
        }
      </div>
      <div>
        <div class="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-label="Work order workflow distribution">
          @for (stage of stages(); track stage.label) {
            @if (stage.count > 0) {
              <span [style.background]="stage.color" [style.width.%]="percent(stage.count)" [attr.title]="stage.label + ': ' + stage.count"></span>
            }
          }
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500">
          <span>{{ activeCount() }} still moving through operations</span>
          @if (cancelledCount() > 0) { <span class="text-red-600">{{ cancelledCount() }} cancelled</span> }
        </div>
      </div>
    </div>
  `
})
export class WorkPipelineComponent {
  readonly buckets = input.required<CountBucket[]>();

  stages() {
    return [
      { label: 'Planned', count: this.count('draft', 'assigned'), color: '#2563eb' },
      { label: 'Active', count: this.count('in progress'), color: '#0891b2' },
      { label: 'Review', count: this.count('pending completion'), color: '#d97706' },
      { label: 'Ready', count: this.count('approved', 'customer notified'), color: '#0f766e' },
      { label: 'Closed', count: this.count('invoiced', 'paid'), color: '#64748b' }
    ];
  }

  total(): number { return this.buckets().reduce((sum, bucket) => sum + bucket.count, 0); }
  activeCount(): number { return this.stages().slice(0, 4).reduce((sum, stage) => sum + stage.count, 0); }
  cancelledCount(): number { return this.count('cancelled'); }
  percent(count: number): number { return Math.round((count / Math.max(1, this.total())) * 100); }

  private count(...labels: string[]): number {
    const accepted = new Set(labels);
    return this.buckets().filter((bucket) => accepted.has(bucket.label.toLowerCase())).reduce((sum, bucket) => sum + bucket.count, 0);
  }
}

interface StatusChartSegment {
  label: string;
  count: number;
  percent: number;
  color: string;
  dashArray: string;
  dashOffset: string;
}

@Component({
  selector: 'chart-bar-row',
  standalone: true,
  template: `
    <div>
      <div class="mb-1 flex items-center justify-between gap-2 text-[0.82rem]">
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
        <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">{{ label() }}</p>
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
  imports: [ButtonModule, ChartBarRowComponent, DashboardPanelComponent, DatePipe, DialogModule, DragDropModule, FinanceBarComponent, RouterLink, TagModule, TenantMetricCardComponent, WorkPipelineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-2.5">
      <div class="dashboard-hero overflow-hidden rounded-lg border text-white shadow-lg">
        <div class="grid gap-2.5 p-3 md:grid-cols-[1fr_auto] md:items-center">
          <div class="min-w-0">
            <p-tag value="Tenant workspace" severity="info" />
            <h1 class="mt-1.5 text-xl font-bold leading-tight md:text-2xl">Property operations command board</h1>
            @if (analytics(); as data) {
              <p class="mt-1 text-sm font-semibold text-slate-300">Updated {{ data.generatedAt | date:'MMM d, h:mm a' }}</p>
            }
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" severity="secondary" icon="pi pi-arrows-alt" [label]="layoutEditing() ? 'Done arranging' : 'Arrange cards'" (click)="layoutEditing.set(!layoutEditing())"></button>
            <a pButton routerLink="/settings" [queryParams]="{ tab: 'branding' }" type="button" severity="secondary" icon="pi pi-palette" label="Customize" class="no-underline"></a>
            <a pButton routerLink="/work-orders" type="button" severity="secondary" icon="pi pi-plus" label="Work order" class="no-underline"></a>
            <button pButton type="button" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (layoutMessage()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ layoutMessage() }}</p>
      }

      @if (analytics(); as data) {
        @if (widgetVisible('metrics')) {
          <div class="grid gap-2.5 md:grid-cols-3">
            @for (metric of data.metrics; track metric.label) {
              <lorne-tenant-metric-card [metric]="metric" />
            }
          </div>
        }

        <section class="grid items-stretch gap-2.5 xl:grid-cols-[1.15fr_.95fr_.9fr]" cdkDropList cdkDropListOrientation="horizontal" [cdkDropListDisabled]="!layoutEditing()" (cdkDropListDropped)="dropDashboardWidget($event, insightWidgetIds)">
          @if (widgetVisible('workMix')) {
          <div cdkDrag class="dashboard-draggable relative h-full min-w-0" [style.order]="widgetOrder('workMix')" [class.dashboard-draggable-active]="layoutEditing()">
            @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Work mix"><i class="pi pi-bars"></i></button> }
            <dashboard-panel eyebrow="Workflow" title="Work pipeline" [badge]="data.workOrders.length + ' total'"><work-pipeline [buckets]="data.statusBuckets" /></dashboard-panel>
          </div>
          }

          @if (widgetVisible('topServices')) {
          <div cdkDrag class="dashboard-draggable relative h-full min-w-0" [style.order]="widgetOrder('topServices')" [class.dashboard-draggable-active]="layoutEditing()">
            @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Top services"><i class="pi pi-bars"></i></button> }
          <dashboard-panel eyebrow="Demand" title="Top services" [badge]="data.serviceBuckets.length + ' services'">
            <div class="grid gap-2">
              @for (bucket of data.serviceBuckets.slice(0, 6); track bucket.label) {
                <chart-bar-row [label]="bucket.label" [value]="bucket.count" [max]="maxCount(data.serviceBuckets)" tone="blue" />
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No service demand yet.</p>
              }
            </div>
          </dashboard-panel>
          </div>
          }

          @if (widgetVisible('finance')) {
          <div cdkDrag class="dashboard-draggable relative h-full min-w-0" [style.order]="widgetOrder('finance')" [class.dashboard-draggable-active]="layoutEditing()">
            @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Finance"><i class="pi pi-bars"></i></button> }
          <dashboard-panel eyebrow="Finance" title="Revenue exposure" [badge]="data.finance.overdueCount + ' overdue'">
            <div class="grid gap-2">
              <finance-bar label="Receivables" [amount]="data.finance.receivables" [max]="financeMax(data)" tone="amber" />
              <finance-bar label="Draft" [amount]="data.finance.draftTotal" [max]="financeMax(data)" tone="blue" />
              <finance-bar label="Sent" [amount]="data.finance.sentTotal" [max]="financeMax(data)" tone="blue" />
              <finance-bar label="Paid" [amount]="data.finance.paidTotal" [max]="financeMax(data)" tone="teal" />
            </div>
          </dashboard-panel>
          </div>
          }
        </section>

        <section class="grid items-start gap-2.5 xl:grid-cols-[1.35fr_.9fr]">
          @if (widgetVisible('actionQueue')) {
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-[0.8rem] font-black uppercase tracking-wide text-teal-700">Action queue</p>
                <h2 class="text-lg font-black text-slate-950">Work needing attention</h2>
            <p class="mt-0.5 text-xs font-semibold text-slate-500">Draft work, worker review, invoice-ready jobs, and today's scheduled work.</p>
              </div>
              <a pButton routerLink="/schedule" type="button" text icon="pi pi-calendar" label="Schedule" class="no-underline"></a>
            </div>
            <div class="mt-2 grid gap-2 md:grid-cols-4">
              <button type="button" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-slate-400 hover:bg-white" [class.border-slate-500]="queueMode() === 'DRAFT'" [class.bg-white]="queueMode() === 'DRAFT'" (click)="queueMode.set('DRAFT')">
                <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">Draft</p>
                <p class="mt-0.5 text-xl font-black text-slate-700">{{ draftWork(data).length }}</p>
                <p class="text-[0.82rem] font-semibold text-slate-500">Needs scheduling or assignment</p>
              </button>
              <button type="button" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50" [class.border-teal-400]="queueMode() === 'TODAY'" [class.bg-teal-50]="queueMode() === 'TODAY'" (click)="queueMode.set('TODAY')">
                <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">Scheduled today</p>
                <p class="mt-0.5 text-xl font-black text-teal-700">{{ data.todayWork.length }}</p>
                <p class="text-[0.82rem] font-semibold text-slate-500">Jobs on today's calendar</p>
              </button>
              <button type="button" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-amber-300 hover:bg-amber-50" [class.border-amber-400]="queueMode() === 'REVIEW'" [class.bg-amber-50]="queueMode() === 'REVIEW'" (click)="queueMode.set('REVIEW')">
                <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">Needs review</p>
                <p class="mt-0.5 text-xl font-black text-amber-700">{{ data.pendingReview.length }}</p>
                <p class="text-[0.82rem] font-semibold text-slate-500">Submitted by workers</p>
              </button>
              <button type="button" class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50" [class.border-blue-400]="queueMode() === 'INVOICE'" [class.bg-blue-50]="queueMode() === 'INVOICE'" (click)="queueMode.set('INVOICE')">
                <p class="text-[0.8rem] font-black uppercase tracking-wide text-slate-500">Ready to invoice</p>
                <p class="mt-0.5 text-xl font-black text-blue-700">{{ data.readyToInvoice.length }}</p>
                <p class="text-[0.82rem] font-semibold text-slate-500">Approved, not invoiced</p>
              </button>
            </div>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-sm font-bold text-slate-700">{{ queueHeading() }} · showing {{ queuePreview(data).length }} of {{ queueWork(data).length }}</p>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="text-sm font-black text-teal-700 hover:text-teal-900" (click)="queueMode.set('ATTENTION')">Combined queue</button>
                <a pButton routerLink="/work-orders" [queryParams]="workOrderQueueParams()" type="button" size="small" severity="secondary" icon="pi pi-list" label="Open full work order list" class="no-underline"></a>
                <a pButton routerLink="/finance" type="button" size="small" severity="secondary" icon="pi pi-dollar" label="Invoices/payments" class="no-underline"></a>
                <a pButton routerLink="/email-audit" type="button" size="small" severity="secondary" icon="pi pi-send" label="Email audit" class="no-underline"></a>
              </div>
            </div>
            <div class="mt-2 max-h-[32rem] overflow-auto rounded-lg border border-slate-200">
              <table class="w-full min-w-[42rem] border-collapse text-sm">
                <thead class="sticky top-0 z-10 bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr><th class="px-3 py-2">Work order</th><th class="px-3 py-2">Property</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Schedule</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (workOrder of queuePreview(data); track workOrder.id) {
                    <tr>
                      <td class="px-3 py-2"><p class="font-black text-slate-950">{{ workOrder.workOrderNumber }}</p><p class="text-[0.82rem] text-slate-500">{{ workOrder.title }}</p></td>
                      <td class="px-3 py-2"><p class="font-semibold text-teal-700">{{ workOrder.propertyName }}</p><p class="text-[0.82rem] text-slate-500">{{ workOrder.ownerName }}</p></td>
                      <td class="px-3 py-2"><p-tag [value]="statusLabel(workOrder.status)" [severity]="workOrderSeverity(workOrder.status)" /></td>
                      <td class="px-3 py-2 text-slate-600">{{ workOrder.scheduledStart ? (workOrder.scheduledStart | date:'MMM d, h:mm a') : 'Unscheduled' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="4" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders in this queue.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          }

          <aside class="grid content-start gap-2.5" cdkDropList [cdkDropListDisabled]="!layoutEditing()" (cdkDropListDropped)="dropDashboardWidget($event, sideWidgetIds)">
            @if (widgetVisible('clockedIn')) {
            <div cdkDrag class="dashboard-draggable relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm" [style.order]="widgetOrder('clockedIn')" [class.dashboard-draggable-active]="layoutEditing()">
              @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Clocked-in workers"><i class="pi pi-bars"></i></button> }
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-[0.8rem] font-black uppercase tracking-wide text-teal-700">Working today</p>
                  <h2 class="mt-0.5 text-lg font-black text-slate-950">Clocked-in workers</h2>
                </div>
                <a pButton routerLink="/payroll" type="button" text icon="pi pi-clock" label="Timesheets" class="no-underline"></a>
              </div>
              <div class="mt-2 grid gap-1.5">
                @for (worker of clockedInToday().slice(0, 5); track worker.workerId) {
                  <button type="button" class="w-full rounded-lg bg-teal-50 px-2.5 py-1.5 text-left transition hover:bg-teal-100" (click)="selectedClockedInWorker.set(worker)">
                    <div class="flex items-center justify-between gap-2">
                      <p class="truncate font-black text-slate-950">{{ worker.workerName }}</p>
                      <p-tag [value]="worker.paused ? 'paused' : 'clocked in'" [severity]="worker.paused ? 'warn' : 'success'" />
                    </div>
                    <p class="mt-1 text-[0.82rem] font-semibold text-slate-500">
                      Since {{ worker.startedAt | date:'MMM d, h:mm a' }} · net {{ minutesLabel(worker.netMinutes || 0) }}
                    </p>
                  </button>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No workers are currently clocked in.</p>
                }
                @if (clockedInToday().length > 5) {
                  <button type="button" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-teal-700 hover:bg-slate-50" (click)="showAllClockedIn.set(true)">
                    View all {{ clockedInToday().length }} active workers
                  </button>
                }
              </div>
            </div>
            }

            @if (widgetVisible('workerLoad')) {
            <div cdkDrag class="dashboard-draggable relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm" [style.order]="widgetOrder('workerLoad')" [class.dashboard-draggable-active]="layoutEditing()">
              @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Worker load"><i class="pi pi-bars"></i></button> }
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-[0.8rem] font-black uppercase tracking-wide text-teal-700">Worker load</p>
                  <h2 class="mt-0.5 text-lg font-black text-slate-950">Active assignments</h2>
                </div>
                <a pButton routerLink="/workers" type="button" text icon="pi pi-users" label="Workers" class="no-underline"></a>
              </div>
              <div class="mt-1.5 grid max-h-[28rem] gap-1.5 overflow-y-auto pr-1">
                @for (worker of data.workerLoad.slice(0, 4); track worker.workerId) {
                  <div class="rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <div class="flex items-center justify-between gap-2">
                      <p class="font-black text-slate-950">{{ worker.workerName }}</p>
                      <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ worker.status.toLowerCase().replaceAll('_', ' ') }}</span>
                    </div>
                    <p class="mt-1 text-[0.82rem] font-semibold text-slate-500">{{ worker.activeJobs }} active jobs · {{ worker.scheduledToday }} today</p>
                    <div class="mt-2">
                      <chart-bar-row label="Load" [value]="worker.activeJobs" [max]="workerLoadMax(data)" tone="teal" />
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No active workers.</p>
                }
              </div>
            </div>
            }

            @if (widgetVisible('inventoryRisk')) {
            <div cdkDrag class="dashboard-draggable relative rounded-lg border border-slate-200 bg-white p-3 shadow-sm" [style.order]="widgetOrder('inventoryRisk')" [class.dashboard-draggable-active]="layoutEditing()">
              @if (layoutEditing()) { <button cdkDragHandle type="button" class="dashboard-drag-handle" title="Drag Inventory risk"><i class="pi pi-bars"></i></button> }
              <div class="flex items-center justify-between gap-2">
                <div><p class="text-[0.8rem] font-black uppercase tracking-wide text-teal-700">Inventory risk</p><h2 class="mt-0.5 text-lg font-black text-slate-950">Low stock</h2></div>
                <a pButton routerLink="/inventory" type="button" text icon="pi pi-box" label="Inventory" class="no-underline"></a>
              </div>
              <div class="mt-2 grid max-h-[18rem] gap-2 overflow-y-auto pr-1">
                @for (item of data.lowInventory.slice(0, 3); track item.id) {
                  <div class="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
                    <div><p class="font-black text-slate-950">{{ item.name }}</p><p class="text-[0.82rem] font-semibold text-slate-500">{{ item.storageLocation || 'No location' }}</p></div>
                    <p class="text-sm font-black text-amber-700">{{ item.quantityOnHand }} {{ item.unit }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg bg-teal-50 px-3 py-3 text-sm font-semibold text-teal-800">No low-stock items.</p>
                }
              </div>
            </div>
            }
          </aside>
        </section>
      } @else if (!loading()) {
        <p class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-10 text-center text-sm font-semibold text-slate-500">No dashboard data loaded.</p>
      }

      <p-dialog
        header="Clocked-in worker"
        [modal]="true"
        [visible]="!!selectedClockedInWorker()"
        [style]="{ width: 'min(34rem, 94vw)' }"
        (visibleChange)="!$event && selectedClockedInWorker.set(null)"
      >
        @if (selectedClockedInWorker(); as worker) {
          <div class="space-y-3">
            <div class="rounded-lg border border-teal-100 bg-teal-50 p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-lg font-black text-slate-950">{{ worker.workerName }}</p>
                  <p class="mt-1 text-sm font-semibold text-slate-600">{{ worker.employeeNumber || worker.email || 'Worker' }}</p>
                </div>
                <p-tag [value]="worker.paused ? 'paused' : 'clocked in'" [severity]="worker.paused ? 'warn' : 'success'" />
              </div>
            </div>
            <div class="grid gap-2 sm:grid-cols-3">
              <p class="rounded-lg border border-slate-200 bg-white p-3 text-sm"><span class="block text-xs font-black uppercase text-slate-500">Clock in</span><strong>{{ worker.startedAt | date:'MMM d, h:mm a' }}</strong></p>
              <p class="rounded-lg border border-slate-200 bg-white p-3 text-sm"><span class="block text-xs font-black uppercase text-slate-500">Gross</span><strong>{{ minutesLabel(worker.grossMinutes || 0) }}</strong></p>
              <p class="rounded-lg border border-slate-200 bg-white p-3 text-sm"><span class="block text-xs font-black uppercase text-slate-500">Net</span><strong class="text-teal-700">{{ minutesLabel(worker.netMinutes || 0) }}</strong></p>
            </div>
            @if (worker.paused && worker.pausedAt) {
              <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                Paused since {{ worker.pausedAt | date:'MMM d, h:mm a' }} · break {{ minutesLabel(worker.pauseMinutes || 0) }}
              </p>
            }
            <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" label="Close" (click)="selectedClockedInWorker.set(null)"></button>
              <a pButton routerLink="/payroll" [queryParams]="{ workerId: worker.workerId, from: todayDate, to: todayDate }" icon="pi pi-clock" label="Open timesheet" class="no-underline"></a>
            </div>
          </div>
        }
      </p-dialog>

      <p-dialog
        header="Workers currently clocked in"
        [modal]="true"
        [visible]="showAllClockedIn()"
        [style]="{ width: 'min(44rem, 94vw)', height: 'min(42rem, 90vh)' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="showAllClockedIn.set($event)"
      >
        <div class="grid gap-2">
          @for (worker of clockedInToday(); track worker.workerId) {
            <button type="button" class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:bg-teal-50" (click)="selectedClockedInWorker.set(worker); showAllClockedIn.set(false)">
              <div class="flex items-center justify-between gap-2">
                <p class="font-black text-slate-950">{{ worker.workerName }}</p>
                <p-tag [value]="worker.paused ? 'paused' : 'clocked in'" [severity]="worker.paused ? 'warn' : 'success'" />
              </div>
              <p class="mt-1 text-sm font-semibold text-slate-500">Since {{ worker.startedAt | date:'MMM d, h:mm a' }} · net {{ minutesLabel(worker.netMinutes || 0) }}</p>
            </button>
          }
        </div>
      </p-dialog>
    </section>
  `,
  styles: [`
    .dashboard-hero { background: var(--tenant-navigation); border-color: color-mix(in srgb, var(--tenant-navigation-contrast) 16%, transparent); border-radius: var(--tenant-radius); }
    .dashboard-draggable-active { outline: 2px dashed color-mix(in srgb, var(--tenant-primary) 55%, transparent); outline-offset: 2px; }
    .dashboard-drag-handle { position: absolute; right: .75rem; top: -.75rem; z-index: 5; display: grid; height: 2rem; width: 2rem; cursor: grab; place-items: center; border: 1px solid color-mix(in srgb, var(--tenant-primary) 28%, white); border-radius: .4rem; background: var(--tenant-primary-soft); color: var(--tenant-primary); box-shadow: 0 4px 12px rgba(15, 23, 42, .12); }
    .dashboard-drag-handle:active { cursor: grabbing; }
    .cdk-drag-preview { border-radius: var(--tenant-radius); box-shadow: 0 18px 45px rgba(15, 23, 42, .24); }
    .cdk-drag-placeholder { opacity: .25; }
  `]
})
export class DashboardComponent {
  private readonly analyticsService = inject(TenantAnalyticsService);
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  protected readonly analytics = signal<TenantAnalytics | null>(null);
  protected readonly clockedInToday = signal<WorkerClockedInTodayRecord[]>([]);
  protected readonly selectedClockedInWorker = signal<WorkerClockedInTodayRecord | null>(null);
  protected readonly showAllClockedIn = signal(false);
  protected readonly queueMode = signal<DashboardQueueMode>('ATTENTION');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly tenantSettings = signal<TenantSettingsRecord | null>(null);
  protected readonly layoutEditing = signal(false);
  protected readonly layoutMessage = signal('');
  protected readonly insightWidgetIds: DashboardWidgetId[] = ['workMix', 'topServices', 'finance'];
  protected readonly sideWidgetIds: DashboardWidgetId[] = ['clockedIn', 'workerLoad', 'inventoryRisk'];
  protected readonly todayDate = dateInput(new Date());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [analytics, clockedInToday, settings] = await Promise.all([
        firstValueFrom(this.analyticsService.overview()),
        firstValueFrom(this.workerManagementService.clockedInToday()),
        firstValueFrom(this.tenantSettingsService.get())
      ]);
      this.analytics.set(analytics);
      this.clockedInToday.set(clockedInToday);
      this.tenantSettings.set(settings);
    } catch {
      this.error.set('Unable to load dashboard data.');
    } finally {
      this.loading.set(false);
    }
  }

  protected widgetVisible(id: DashboardWidgetId): boolean {
    return !(this.tenantSettings()?.dashboardHiddenWidgets || []).includes(id);
  }

  protected widgetOrder(id: DashboardWidgetId): number {
    const index = (this.tenantSettings()?.dashboardWidgetOrder || []).indexOf(id);
    return index < 0 ? 99 : index;
  }

  protected async dropDashboardWidget(event: CdkDragDrop<unknown>, zone: DashboardWidgetId[]): Promise<void> {
    const settings = this.tenantSettings();
    if (!settings || event.previousIndex === event.currentIndex) {
      return;
    }
    const globalOrder: DashboardWidgetId[] = settings.dashboardWidgetOrder?.length
      ? [...settings.dashboardWidgetOrder]
      : ['metrics', 'actionQueue', 'clockedIn', 'workMix', 'topServices', 'finance', 'workerLoad', 'inventoryRisk'];
    const orderedZone = zone.filter((id) => !settings.dashboardHiddenWidgets.includes(id)).sort((left, right) => globalOrder.indexOf(left) - globalOrder.indexOf(right));
    moveItemInArray(orderedZone, event.previousIndex, event.currentIndex);
    const positions = globalOrder.map((id, index) => zone.includes(id) && !settings.dashboardHiddenWidgets.includes(id) ? index : -1).filter((index) => index >= 0);
    positions.forEach((position, index) => globalOrder[position] = orderedZone[index]);
    this.tenantSettings.set({ ...settings, dashboardWidgetOrder: globalOrder });
    this.layoutMessage.set('Saving dashboard layout...');
    try {
      const saved = await firstValueFrom(this.tenantSettingsService.update({ ...settings, dashboardWidgetOrder: globalOrder }));
      this.tenantSettings.set(saved);
      this.layoutMessage.set('Dashboard layout saved.');
      window.setTimeout(() => this.layoutMessage.set(''), 2200);
    } catch {
      this.tenantSettings.set(settings);
      this.layoutMessage.set('Unable to save dashboard layout.');
    }
  }

  protected priorityWork(data: TenantAnalytics) {
    return [...this.draftWork(data), ...data.pendingReview, ...data.readyToInvoice, ...data.todayWork]
      .filter((workOrder, index, list) => list.findIndex((candidate) => candidate.id === workOrder.id) === index)
      .sort((left, right) => statusRank(left.status) - statusRank(right.status) || dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
  }

  protected draftWork(data: TenantAnalytics): WorkOrderRecord[] {
    return data.workOrders.filter((workOrder) => workOrder.status === 'DRAFT');
  }

  protected queueWork(data: TenantAnalytics): WorkOrderRecord[] {
    if (this.queueMode() === 'DRAFT') {
      return this.draftWork(data).sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart) || left.workOrderNumber.localeCompare(right.workOrderNumber));
    }
    if (this.queueMode() === 'TODAY') {
      return [...data.todayWork].sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
    }
    if (this.queueMode() === 'REVIEW') {
      return [...data.pendingReview].sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
    }
    if (this.queueMode() === 'INVOICE') {
      return [...data.readyToInvoice].sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
    }
    return this.priorityWork(data);
  }

  protected queuePreview(data: TenantAnalytics): WorkOrderRecord[] {
    return this.queueWork(data).slice(0, 7);
  }

  protected queueHeading(): string {
    if (this.queueMode() === 'DRAFT') {
      return 'Draft work';
    }
    if (this.queueMode() === 'TODAY') {
      return 'Scheduled today';
    }
    if (this.queueMode() === 'REVIEW') {
      return 'Needs review';
    }
    if (this.queueMode() === 'INVOICE') {
      return 'Ready to invoice';
    }
    return 'Combined attention queue';
  }

  protected workOrderQueueParams(): Record<string, string> {
    if (this.queueMode() === 'DRAFT') {
      return { status: 'DRAFT', date: 'ALL' };
    }
    if (this.queueMode() === 'TODAY') {
      return { status: 'ALL', date: 'TODAY' };
    }
    if (this.queueMode() === 'REVIEW') {
      return { status: 'REVIEW', date: 'ALL' };
    }
    if (this.queueMode() === 'INVOICE') {
      return { status: 'BILLING', date: 'ALL' };
    }
    return { status: 'OPEN', date: 'ALL' };
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

  protected minutesLabel(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }
}

function statusRank(status: string): number {
  return { DRAFT: 0, PENDING_COMPLETION: 1, APPROVED: 2, CUSTOMER_NOTIFIED: 3 }[status] ?? 9;
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
