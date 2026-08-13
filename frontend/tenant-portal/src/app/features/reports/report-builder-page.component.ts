import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TenantAnalytics, TenantAnalyticsService } from '../analytics/services/tenant-analytics.service';
import {
  actualTimingLabel,
  closedReportStatuses,
  completedReportStatuses,
  dateRangeLabel,
  printHtmlDocument,
  ReportType,
  scheduleLabel,
  selectedReportActualHours,
  selectedReportHtml,
  selectedReportInvoiceCount,
  selectedReportRows,
  statusLabel,
  workerNames
} from './report-generation';
import { ReportTotalComponent } from './reports-page.component';

@Component({
  selector: 'lorne-report-builder-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule, ReportTotalComponent, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-2.5">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <a pButton routerLink="/reports" type="button" severity="secondary" icon="pi pi-arrow-left" label="Reports" class="no-underline"></a>
            <p-tag value="Report builder" severity="info" />
            <h1 class="text-lg font-bold text-slate-950 md:text-xl">Worker and property reports</h1>
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
          <div class="grid gap-2 md:grid-cols-[10rem_1fr_10rem_10rem_auto]">
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Report type</span>
              <select class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="reportType" [(ngModel)]="reportType" (ngModelChange)="onReportTypeChange(data)">
                <option value="WORKER">Worker</option>
                <option value="PROPERTY">Property</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">{{ reportType === 'WORKER' ? 'Worker' : 'Property' }}</span>
              <select class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="reportTargetId" [(ngModel)]="reportTargetId">
                @if (reportType === 'WORKER') {
                  <option value="">Select worker</option>
                  @for (worker of data.workers; track worker.id) {
                    <option [value]="worker.id">{{ worker.displayName }}{{ worker.email ? ' · ' + worker.email : '' }}</option>
                  }
                } @else {
                  <option value="">Select property</option>
                  @for (property of data.properties; track property.id) {
                    <option [value]="property.id">{{ property.name }} · {{ property.ownerName }}</option>
                  }
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">From</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="reportDateFrom" [(ngModel)]="reportDateFrom" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">To</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="reportDateTo" [(ngModel)]="reportDateTo" />
            </label>
            <button pButton type="button" icon="pi pi-print" label="Generate report" [disabled]="!reportTargetId" (click)="printSelectedReport(data)"></button>
          </div>
        </section>

        <div class="grid gap-2 md:grid-cols-5">
          <report-total label="Work orders" [value]="rows(data).length" detail="Matching selected report" />
          <report-total label="Open" [value]="openCount(data)" detail="Not closed yet" />
          <report-total label="Completed" [value]="completedCount(data)" detail="Completed or later" />
          <report-total label="Invoices" [value]="invoiceCount(data)" detail="Linked invoices" />
          <report-total label="Actual hours" [value]="actualHours(data)" detail="Worker field time" />
        </div>

        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Preview</p>
              <h2 class="text-base font-black text-slate-950">{{ rows(data).length }} matching work orders</h2>
            </div>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ dateRangeLabel(reportDateFrom, reportDateTo) || 'All dates' }}</span>
          </div>
          <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table class="w-full min-w-[66rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Work order</th>
                  <th class="px-3 py-2">Property</th>
                  <th class="px-3 py-2">Worker(s)</th>
                  <th class="px-3 py-2">Status</th>
                  <th class="px-3 py-2">Schedule</th>
                  <th class="px-3 py-2">Actual field time</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (workOrder of rows(data).slice(0, 20); track workOrder.id) {
                  <tr>
                    <td class="px-3 py-2"><p class="font-black text-teal-700">{{ workOrder.workOrderNumber }}</p><p class="font-semibold text-slate-950">{{ workOrder.title }}</p></td>
                    <td class="px-3 py-2"><p class="font-bold text-slate-800">{{ workOrder.propertyName }}</p><p class="text-xs font-semibold text-slate-500">{{ workOrder.ownerName }}</p></td>
                    <td class="px-3 py-2 text-slate-600">{{ workerNames(workOrder) }}</td>
                    <td class="px-3 py-2"><p-tag [value]="statusLabel(workOrder.status)" severity="secondary" /></td>
                    <td class="px-3 py-2 text-slate-600">{{ scheduleLabel(workOrder) }}</td>
                    <td class="px-3 py-2 text-slate-600">{{ actualTimingLabel(workOrder, reportType, reportTargetId) }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders match these filters.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    </section>
  `
})
export class ReportBuilderPageComponent {
  private readonly analyticsService = inject(TenantAnalyticsService);
  protected readonly analytics = signal<TenantAnalytics | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected reportType: ReportType = 'WORKER';
  protected reportTargetId = '';
  protected reportDateFrom = '';
  protected reportDateTo = '';

  protected readonly workerNames = workerNames;
  protected readonly statusLabel = statusLabel;
  protected readonly scheduleLabel = scheduleLabel;
  protected readonly actualTimingLabel = actualTimingLabel;
  protected readonly dateRangeLabel = dateRangeLabel;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const analytics = await firstValueFrom(this.analyticsService.overview());
      this.analytics.set(analytics);
    } catch {
      this.error.set('Unable to load report builder.');
    } finally {
      this.loading.set(false);
    }
  }

  protected onReportTypeChange(data: TenantAnalytics): void {
    this.reportTargetId = '';
  }

  protected rows(data: TenantAnalytics) {
    return selectedReportRows({
      data,
      reportType: this.reportType,
      targetId: this.reportTargetId,
      dateFrom: this.reportDateFrom,
      dateTo: this.reportDateTo
    });
  }

  protected openCount(data: TenantAnalytics): number {
    return this.rows(data).filter((workOrder) => !closedReportStatuses.has(workOrder.status)).length;
  }

  protected completedCount(data: TenantAnalytics): number {
    return this.rows(data).filter((workOrder) => completedReportStatuses.has(workOrder.status)).length;
  }

  protected invoiceCount(data: TenantAnalytics): number {
    return selectedReportInvoiceCount(data, this.rows(data));
  }

  protected actualHours(data: TenantAnalytics): number {
    return selectedReportActualHours(this.rows(data), this.reportType, this.reportTargetId);
  }

  protected printSelectedReport(data: TenantAnalytics): void {
    printHtmlDocument(selectedReportHtml({
      title: this.selectedReportTitle(data),
      reportType: this.reportType === 'WORKER' ? 'Worker report' : 'Property report',
      generatedAt: data.generatedAt,
      rows: this.rows(data),
      invoices: data.invoices,
      reportMode: this.reportType,
      targetId: this.reportTargetId,
      dateRangeLabel: dateRangeLabel(this.reportDateFrom, this.reportDateTo)
    }));
  }

  private selectedReportTitle(data: TenantAnalytics): string {
    if (this.reportType === 'WORKER') {
      return data.workers.find((worker) => worker.id === this.reportTargetId)?.displayName ?? 'Worker';
    }
    return data.properties.find((property) => property.id === this.reportTargetId)?.name ?? 'Property';
  }
}
