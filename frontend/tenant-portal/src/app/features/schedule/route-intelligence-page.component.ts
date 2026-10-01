import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import type { WorkOrderRecord, WorkerRecord } from '@lorne/contracts';
import { WorkOrderService } from '../work-orders/services/work-order.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';

interface RouteRow {
  workOrder: WorkOrderRecord;
  workerId: string;
  workerName: string;
  estimatedTravelMinutes?: number;
  providerLabel: string;
  geofenceReady: boolean;
}

interface RouteWorkerOption {
  workerId: string;
  workerName: string;
  employeeNumber?: string;
  email?: string;
  stopCount: number;
}

type RouteRangePreset = 'TODAY' | 'TOMORROW' | 'WEEK' | 'CUSTOM';

@Component({
  selector: 'lorne-route-intelligence-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, FormsModule, SelectModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p-tag value="Dispatch" severity="success" />
              <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Route intelligence</h1>
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Updated {{ generatedAt() | date:'MMM d, h:mm a' }}</span>
            </div>
            <p class="mt-1 text-sm font-semibold text-slate-600">
              Review travel estimates, route readiness, and GPS/geofence gaps before workers start the day.
            </p>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Range
              <select class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" [ngModel]="rangePreset()" (ngModelChange)="setRangePreset($event)">
                <option value="TODAY">Today</option>
                <option value="TOMORROW">Tomorrow</option>
                <option value="WEEK">This week</option>
                <option value="CUSTOM">Custom</option>
              </select>
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              From
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [ngModel]="fromDate()" (ngModelChange)="setCustomFrom($event)" />
            </label>
            <label class="grid gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              To
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="date" [ngModel]="toDate()" (ngModelChange)="setCustomTo($event)" />
            </label>
            <label class="grid min-w-[14rem] gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Worker
              <p-select
                styleClass="w-full"
                [options]="routeWorkers()"
                optionLabel="workerName"
                optionValue="workerId"
                filterBy="workerName,email,employeeNumber"
                [filter]="true"
                [showClear]="true"
                appendTo="body"
                placeholder="All workers"
                [ngModel]="selectedWorkerId()"
                (ngModelChange)="selectedWorkerId.set($event || '')"
              >
                <ng-template pTemplate="item" let-worker>
                  <div>
                    <p class="font-bold text-slate-900">{{ worker.workerName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ worker.employeeNumber || worker.email || 'Worker' }} · {{ worker.stopCount }} stop{{ worker.stopCount === 1 ? '' : 's' }}</p>
                  </div>
                </ng-template>
                <ng-template pTemplate="selectedItem" let-worker>
                  <span>{{ worker?.workerName || 'All workers' }}{{ worker ? ' · ' + worker.stopCount + ' stops' : '' }}</span>
                </ng-template>
              </p-select>
            </label>
            <label class="grid min-w-[18rem] gap-1 text-xs font-black uppercase tracking-wide text-slate-500">
              Search
              <input class="h-10 rounded-lg border border-slate-300 px-2 text-sm font-semibold normal-case text-slate-800" type="search" placeholder="Worker, address, work order, service" [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" />
            </label>
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }

      @if (workOrders()) {
        <div class="grid gap-3 md:grid-cols-4">
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Stops</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ routeRows().length }}</p>
            <p class="text-xs font-semibold text-slate-500">Visible worker stops</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Map estimates</p>
            <p class="mt-1 text-2xl font-black text-teal-700">{{ estimateCount() }}</p>
            <p class="text-xs font-semibold text-slate-500">Rows with travel time</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">Missing estimates</p>
            <p class="mt-1 text-2xl font-black text-amber-700">{{ missingEstimateCount() }}</p>
            <p class="text-xs font-semibold text-slate-500">Needs route calculation</p>
          </article>
          <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-slate-500">GPS/geofence</p>
            <p class="mt-1 text-2xl font-black text-slate-950">{{ geofenceReadyCount() }}</p>
            <p class="text-xs font-semibold text-slate-500">Stops with site coordinates</p>
          </article>
        </div>

        <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Route actions</p>
              <h2 class="text-base font-black text-slate-950">Calculate, optimize, and open worker routes</h2>
              <p class="mt-1 text-xs font-semibold text-slate-500">
                Estimates are stored on each work order assignment or route stop. Route order and map preview use one worker on one service day.
              </p>
            </div>
            <div class="grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2 xl:min-w-[28rem]">
              <div class="rounded-lg bg-slate-50 px-3 py-2">
                <span class="block font-black uppercase tracking-wide text-slate-500">Planning scope</span>
                <strong class="mt-1 block text-slate-900">{{ routePlanningScope() }}</strong>
              </div>
              <div class="rounded-lg bg-slate-50 px-3 py-2">
                <span class="block font-black uppercase tracking-wide text-slate-500">Readiness</span>
                <strong class="mt-1 block" [class.text-teal-700]="routeReady()" [class.text-amber-700]="!routeReady()">{{ routeReadinessLabel() }}</strong>
              </div>
            </div>
            <div class="grid gap-2 sm:grid-cols-[auto_auto_auto]">
              <button
                pButton
                type="button"
                severity="secondary"
                icon="pi pi-compass"
                label="Recalculate map estimates"
                [loading]="recalculating()"
                [disabled]="recalculating() || uniqueVisibleWorkOrderIds().length === 0"
                (click)="recalculateMapEstimates()"
              ></button>
              <button
                pButton
                type="button"
                [severity]="optimizedView() ? 'success' : 'secondary'"
                icon="pi pi-sort-alt"
                [label]="optimizedView() ? 'Optimized view on' : 'Optimize route order'"
                [disabled]="!routeActionReady()"
                (click)="optimizedView.set(!optimizedView())"
              ></button>
              <button
                pButton
                type="button"
                icon="pi pi-map"
                label="Show worker route on map"
                [disabled]="!routeActionReady()"
                (click)="openWorkerRouteMap()"
              ></button>
            </div>
          </div>
        </section>

        <section class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          @for (worker of workerRouteSummaries(); track worker.workerId) {
            <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-base font-black text-slate-950">{{ worker.workerName }}</p>
                  <p class="mt-1 text-xs font-semibold text-slate-500">{{ worker.stopCount }} stops · {{ worker.readyCount }} ready · {{ worker.missingEstimateCount }} missing estimates</p>
                </div>
                <p-tag [value]="minutesLabel(worker.estimatedTravelMinutes)" [severity]="worker.missingEstimateCount ? 'warn' : 'success'" />
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2 text-xs">
                <p class="rounded-lg bg-slate-50 px-2 py-1.5"><span class="block font-black uppercase text-slate-500">First</span><strong class="text-slate-900">{{ worker.firstAt ? (worker.firstAt | date:'h:mm a') : 'Unscheduled' }}</strong></p>
                <p class="rounded-lg bg-slate-50 px-2 py-1.5"><span class="block font-black uppercase text-slate-500">Last</span><strong class="text-slate-900">{{ worker.lastAt ? (worker.lastAt | date:'h:mm a') : 'Unscheduled' }}</strong></p>
              </div>
              <div class="mt-3 flex gap-2">
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-filter" label="View worker" (click)="selectedWorkerId.set(worker.workerId)"></button>
                <button pButton type="button" size="small" icon="pi pi-map" label="Map" [disabled]="!worker.addressCount" (click)="openWorkerRouteMap(worker.workerId)"></button>
              </div>
            </article>
          } @empty {
            <div class="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">
              No worker routes found for this range.
            </div>
          }
        </section>

        <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-2 border-b border-slate-200 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Daily route plan</p>
              <h2 class="text-base font-black text-slate-950">{{ fromDate() | date:'mediumDate' }} - {{ toDate() | date:'mediumDate' }}</h2>
            </div>
            <p-tag [value]="workerCount() + ' workers'" severity="info" />
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[72rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Time</th>
                  <th class="px-3 py-2">Worker</th>
                  <th class="px-3 py-2">Work order</th>
                  <th class="px-3 py-2">Address</th>
                  <th class="px-3 py-2">To-site estimate</th>
                  <th class="px-3 py-2">GPS/geofence</th>
                  <th class="px-3 py-2">Readiness</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of routeRows(); track row.workOrder.id + row.workerId) {
                  <tr>
                    <td class="px-3 py-2 font-black text-slate-700">{{ row.workOrder.scheduledStart ? (row.workOrder.scheduledStart | date:'h:mm a') : 'Unscheduled' }}</td>
                    <td class="px-3 py-2 font-semibold text-slate-700">{{ row.workerName }}</td>
                    <td class="px-3 py-2">
                      <p class="font-black text-teal-700">{{ row.workOrder.workOrderNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ row.workOrder.title }}</p>
                    </td>
                    <td class="px-3 py-2">
                      <p class="font-bold text-slate-800">{{ row.workOrder.propertyName }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ row.workOrder.propertyAddress || 'Missing address' }}</p>
                    </td>
                    <td class="px-3 py-2">
                      @if (row.estimatedTravelMinutes) {
                        <p class="font-black text-slate-800">{{ minutesLabel(row.estimatedTravelMinutes) }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ row.providerLabel }}</p>
                      } @else {
                        <p-tag value="missing" severity="warn" />
                      }
                    </td>
                    <td class="px-3 py-2">
                      <p-tag [value]="row.geofenceReady ? 'ready' : 'needs coordinates'" [severity]="row.geofenceReady ? 'success' : 'warn'" />
                      <p class="mt-1 text-xs font-semibold text-slate-500">{{ row.geofenceReady ? 'Arrival can be compared against site geofence.' : 'Add property latitude/longitude to verify GPS.' }}</p>
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex flex-wrap gap-1">
                        <span class="rounded-full bg-teal-50 px-2 py-1 text-xs font-black text-teal-800">sequence</span>
                        @if (row.estimatedTravelMinutes) {
                          <span class="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-800">travel estimate</span>
                        }
                        @if (row.workOrder.propertyAddress) {
                          <span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-800">map address</span>
                        }
                        @if (row.geofenceReady) {
                          <span class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-800">geofence input</span>
                        }
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="px-3 py-12 text-center text-sm font-semibold text-slate-500">No scheduled work found for this range and search.</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p class="text-xs font-black uppercase tracking-wide text-amber-800">Next automation layer</p>
          <div class="mt-2 grid gap-2 text-sm font-semibold text-amber-950 md:grid-cols-2">
            <p class="rounded-lg bg-white/60 px-3 py-2">Persist optimized route order after dispatcher approval.</p>
            <p class="rounded-lg bg-white/60 px-3 py-2">Auto-detect arrival/completion from GPS geofence and worker confirmation.</p>
          </div>
        </section>
      }
    </section>
  `
})
export class RouteIntelligencePageComponent {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly workerManagementService = inject(WorkerManagementService);
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly generatedAt = signal(new Date().toISOString());
  protected readonly loading = signal(false);
  protected readonly recalculating = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly optimizedView = signal(false);
  protected readonly selectedWorkerId = signal('');
  protected readonly rangePreset = signal<RouteRangePreset>('TODAY');
  protected readonly fromDate = signal(dateInput(new Date()));
  protected readonly toDate = signal(dateInput(new Date()));
  protected readonly searchTerm = signal('');

  protected readonly allRouteRows = computed(() => this.workOrders()
    .flatMap((workOrder) => workOrder.assignments.map((assignment) => ({
      workOrder,
      workerId: assignment.workerId,
      workerName: assignment.workerName,
      estimatedTravelMinutes: assignment.estimatedTravelMinutes || routeStopEstimate(workOrder),
      providerLabel: providerLabel(assignment.travelEstimateProvider || routeStopProvider(workOrder)),
      geofenceReady: hasPropertyCoordinates(workOrder)
    }))));
  protected readonly routeRows = computed(() => {
    const search = normalizeSearch(this.searchTerm());
    const workerId = this.selectedWorkerId();
    return this.allRouteRows()
      .filter((row) => !workerId || row.workerId === workerId)
      .filter((row) => !search || routeSearchText(row.workOrder, row.workerName).includes(search))
      .sort((left, right) => this.optimizedView()
        ? optimizedRouteSort(left, right)
        : dateValue(left.workOrder.scheduledStart) - dateValue(right.workOrder.scheduledStart) || left.workerName.localeCompare(right.workerName));
  });
  protected readonly estimateCount = computed(() => this.routeRows().filter((row) => Boolean(row.estimatedTravelMinutes)).length);
  protected readonly missingEstimateCount = computed(() => this.routeRows().length - this.estimateCount());
  protected readonly geofenceReadyCount = computed(() => this.routeRows().filter((row) => row.geofenceReady).length);
  protected readonly workerCount = computed(() => new Set(this.routeRows().map((row) => row.workerName)).size);
  protected readonly isSingleDayRange = computed(() => this.fromDate() === this.toDate());
  protected readonly addressMissingCount = computed(() => this.routeRows().filter((row) => !row.geofenceReady).length);
  protected readonly routeActionReady = computed(() => Boolean(this.selectedWorkerId() && this.isSingleDayRange() && this.selectedWorkerRouteRows().length));
  protected readonly routeReady = computed(() => this.routeActionReady() && this.missingEstimateCount() === 0 && this.addressMissingCount() === 0);
  protected readonly routePlanningScope = computed(() => {
    const worker = this.routeWorkers().find((candidate) => candidate.workerId === this.selectedWorkerId());
    if (!worker && !this.isSingleDayRange()) {
      return 'Choose one worker and one day';
    }
    if (!worker) {
      return 'Choose a worker';
    }
    if (!this.isSingleDayRange()) {
      return `${worker.workerName}: choose one day`;
    }
    return `${worker.workerName}: ${this.selectedWorkerRouteRows().length} mapped stops`;
  });
  protected readonly routeReadinessLabel = computed(() => {
    if (!this.selectedWorkerId()) {
      return 'Worker needed';
    }
    if (!this.isSingleDayRange()) {
      return 'Single-day view needed';
    }
    if (!this.selectedWorkerRouteRows().length) {
      return 'No mapped stops';
    }
    const issues = this.missingEstimateCount() + this.addressMissingCount();
    return issues ? `${issues} readiness gaps` : 'Ready for dispatch';
  });
  protected readonly routeWorkers = computed(() => {
    const stopCounts = new Map<string, number>();
    for (const row of this.allRouteRows()) {
      stopCounts.set(row.workerId, (stopCounts.get(row.workerId) || 0) + 1);
    }
    const workerOptions: RouteWorkerOption[] = this.workers()
      .filter((worker) => worker.status === 'ACTIVE')
      .map((worker) => ({
        workerId: worker.id,
        workerName: worker.displayName,
        employeeNumber: worker.employeeNumber,
        email: worker.email,
        stopCount: stopCounts.get(worker.id) || 0
      }));
    for (const row of this.allRouteRows()) {
      if (!workerOptions.some((worker) => worker.workerId === row.workerId)) {
        workerOptions.push({
          workerId: row.workerId,
          workerName: row.workerName,
          stopCount: stopCounts.get(row.workerId) || 0
        });
      }
    }
    return workerOptions.sort((left, right) => left.workerName.localeCompare(right.workerName));
  });
  protected readonly selectedWorkerRouteRows = computed(() => this.routeRows()
    .filter((row) => row.workerId === this.selectedWorkerId() && row.workOrder.propertyAddress)
    .filter((row, index, rows) => rows.findIndex((candidate) => candidate.workOrder.propertyAddress === row.workOrder.propertyAddress) === index));
  protected readonly uniqueVisibleWorkOrderIds = computed(() => [...new Set(this.routeRows().map((row) => row.workOrder.id))]);
  protected readonly workerRouteSummaries = computed(() => {
    const summaries = new Map<string, {
      workerId: string;
      workerName: string;
      stopCount: number;
      readyCount: number;
      missingEstimateCount: number;
      estimatedTravelMinutes: number;
      firstAt?: string;
      lastAt?: string;
      addressCount: number;
    }>();
    for (const row of this.routeRows()) {
      const summary = summaries.get(row.workerId) || {
        workerId: row.workerId,
        workerName: row.workerName,
        stopCount: 0,
        readyCount: 0,
        missingEstimateCount: 0,
        estimatedTravelMinutes: 0,
        firstAt: undefined,
        lastAt: undefined,
        addressCount: 0
      };
      summary.stopCount += 1;
      summary.readyCount += row.geofenceReady ? 1 : 0;
      summary.missingEstimateCount += row.estimatedTravelMinutes ? 0 : 1;
      summary.estimatedTravelMinutes += row.estimatedTravelMinutes || 0;
      summary.addressCount += row.workOrder.propertyAddress ? 1 : 0;
      summary.firstAt = earlier(summary.firstAt, row.workOrder.scheduledStart);
      summary.lastAt = later(summary.lastAt, row.workOrder.scheduledStart);
      summaries.set(row.workerId, summary);
    }
    return [...summaries.values()].sort((left, right) => left.workerName.localeCompare(right.workerName));
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const [workOrders, workers] = await Promise.all([
        firstValueFrom(this.workOrderService.list({
          statusFilter: 'ALL',
          dateFilter: 'CUSTOM',
          customFrom: this.fromDate(),
          customTo: this.toDate()
        })),
        firstValueFrom(this.workerManagementService.list())
      ]);
      this.workOrders.set(workOrders);
      this.workers.set(workers);
      this.generatedAt.set(new Date().toISOString());
      if (this.selectedWorkerId() && !this.routeWorkers().some((worker) => worker.workerId === this.selectedWorkerId())) {
        this.selectedWorkerId.set('');
      }
    } catch {
      this.error.set('Unable to load route intelligence.');
    } finally {
      this.loading.set(false);
    }
  }

  protected setRangePreset(value: RouteRangePreset): void {
    this.rangePreset.set(value);
    const today = new Date();
    if (value === 'TODAY') {
      this.fromDate.set(dateInput(today));
      this.toDate.set(dateInput(today));
    } else if (value === 'TOMORROW') {
      const tomorrow = addDays(today, 1);
      this.fromDate.set(dateInput(tomorrow));
      this.toDate.set(dateInput(tomorrow));
    } else if (value === 'WEEK') {
      this.fromDate.set(dateInput(today));
      this.toDate.set(dateInput(addDays(today, 6)));
    }
    void this.load();
  }

  protected setCustomFrom(value: string): void {
    this.rangePreset.set('CUSTOM');
    this.fromDate.set(value);
  }

  protected setCustomTo(value: string): void {
    this.rangePreset.set('CUSTOM');
    this.toDate.set(value);
  }

  protected minutesLabel(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  protected async recalculateMapEstimates(): Promise<void> {
    if (this.recalculating()) {
      return;
    }
    const workOrderIds = this.uniqueVisibleWorkOrderIds();
    if (workOrderIds.length === 0) {
      return;
    }
    if (workOrderIds.length > 50) {
      this.error.set('Please narrow the date range or search before recalculating. You can refresh up to 50 work orders at a time.');
      return;
    }
    this.recalculating.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const refreshed = await firstValueFrom(this.workOrderService.refreshTravelEstimates({ workOrderIds }));
      const refreshedById = new Map(refreshed.map((workOrder) => [workOrder.id, workOrder]));
      this.workOrders.update((workOrders) => workOrders.map((workOrder) => refreshedById.get(workOrder.id) || workOrder));
      this.generatedAt.set(new Date().toISOString());
      this.message.set(`Map estimates refreshed for ${refreshed.length} work orders.`);
    } catch (error) {
      this.error.set(errorMessage(error, 'Unable to recalculate map estimates.'));
    } finally {
      this.recalculating.set(false);
    }
  }

  protected openWorkerRouteMap(workerId = this.selectedWorkerId()): void {
    const addresses = this.routeRows()
      .filter((row) => row.workerId === workerId && row.workOrder.propertyAddress)
      .filter((row, index, rows) => rows.findIndex((candidate) => candidate.workOrder.propertyAddress === row.workOrder.propertyAddress) === index)
      .map((row) => row.workOrder.propertyAddress)
      .filter(Boolean);
    if (addresses.length === 0) {
      return;
    }
    globalThis.open(googleDirectionsUrl(addresses), '_blank', 'noopener');
  }
}

function routeStopEstimate(workOrder: WorkOrderRecord): number | undefined {
  return workOrder.routeStops.find((stop) => stop.estimatedTravelMinutes)?.estimatedTravelMinutes;
}

function routeStopProvider(workOrder: WorkOrderRecord): string | undefined {
  return workOrder.routeStops.find((stop) => stop.travelEstimateProvider)?.travelEstimateProvider;
}

function providerLabel(value?: string): string {
  if (!value) {
    return 'Map estimate';
  }
  return value.toLowerCase().replaceAll('_', ' ');
}

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function routeSearchText(workOrder: WorkOrderRecord, workerName: string): string {
  return [
    workOrder.workOrderNumber,
    workOrder.title,
    workOrder.propertyName,
    workOrder.propertyAddress,
    workOrder.ownerName,
    workOrder.serviceName,
    workOrder.status,
    workerName,
    ...workOrder.assignments.map((assignment) => assignment.workerName),
    ...workOrder.assignments.map((assignment) => assignment.workerEmail)
  ].filter(Boolean).join(' ').toLowerCase();
}

function hasPropertyCoordinates(workOrder: WorkOrderRecord): boolean {
  return typeof workOrder.propertyLatitude === 'number' && typeof workOrder.propertyLongitude === 'number';
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

function earlier(left?: string, right?: string): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return dateValue(left) <= dateValue(right) ? left : right;
}

function later(left?: string, right?: string): string | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }
  return dateValue(left) >= dateValue(right) ? left : right;
}

function optimizedRouteSort(left: RouteRow, right: RouteRow): number {
  return left.workerName.localeCompare(right.workerName)
    || missingEstimateRank(left) - missingEstimateRank(right)
    || dateValue(left.workOrder.scheduledStart) - dateValue(right.workOrder.scheduledStart)
    || left.workOrder.propertyName.localeCompare(right.workOrder.propertyName);
}

function missingEstimateRank(row: RouteRow): number {
  return row.estimatedTravelMinutes ? 0 : 1;
}

function googleDirectionsUrl(addresses: string[]): string {
  if (addresses.length === 1) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addresses[0])}`;
  }
  const [origin, ...remaining] = addresses;
  const destination = remaining[remaining.length - 1];
  const waypoints = remaining.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
    travelmode: 'driving'
  });
  if (waypoints.length) {
    params.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error && 'error' in error) {
    const response = error as { error?: { error?: { message?: string }; message?: string } };
    return response.error?.error?.message || response.error?.message || fallback;
  }
  return fallback;
}
