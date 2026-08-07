import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import {
  CreateRecurringWorkTemplateRequest,
  CreateWorkOrderRequest,
  GeneratedRecurringDraft,
  PropertyRecord,
  RecurringWorkTemplate,
  ServiceType,
  WorkerAvailabilityOption,
  WorkerRecord,
  WorkOrderRecord,
  WorkOrderStatus
} from '@lorne/contracts';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { WorkOrderService } from '../work-orders/services/work-order.service';
import { RecurringWorkService } from './services/recurring-work.service';

@Component({
  selector: 'lorne-dispatch-schedule-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, InputTextModule, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Dispatch" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Schedule board</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ scheduledThisWeek().length }} scheduled this week</span>
            <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{{ unscheduledQueue().length }} unscheduled</span>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <button pButton type="button" severity="secondary" icon="pi pi-chevron-left" label="Prev" (click)="moveWeek(-1)"></button>
            <input class="h-10 border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="date" name="selectedDate" [(ngModel)]="selectedDate" />
            <button pButton type="button" severity="secondary" icon="pi pi-chevron-right" iconPos="right" label="Next" (click)="moveWeek(1)"></button>
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Reload" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <div class="grid gap-3 xl:grid-cols-[22rem_1fr]">
        <aside class="space-y-2">
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">Draft work orders</h2>
              <a routerLink="/work-orders" class="text-xs font-bold text-teal-700 no-underline">Manage</a>
            </div>
            <div class="max-h-[34rem] space-y-2 overflow-y-auto pr-1">
              @for (workOrder of unscheduledQueue(); track workOrder.id) {
                <article class="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 truncate text-sm font-bold text-slate-950">{{ workOrder.title }}</p>
                    <p-tag [value]="statusLabel(workOrder.status)" [severity]="statusSeverity(workOrder.status)" />
                  </div>
                  <p class="mt-1 text-xs font-bold text-teal-700">{{ workOrder.workOrderNumber }}</p>
                  <p class="mt-1 truncate text-xs font-semibold text-slate-600">{{ workOrder.propertyName }} · {{ workOrder.ownerName }}</p>
                  <p class="mt-1 truncate text-xs text-slate-500">{{ workOrder.serviceName || 'General service' }} · {{ sourceLabel(workOrder.source) }}</p>
                  <button pButton type="button" size="small" class="mt-2 w-full" icon="pi pi-calendar-plus" label="Schedule" (click)="openPlanner(workOrder)"></button>
                </article>
              } @empty {
                <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No draft or unscheduled work orders.</p>
              }
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="mb-2 flex items-center justify-between gap-2">
              <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">Recurring work</h2>
              <button pButton type="button" size="small" icon="pi pi-plus" label="Add" (click)="showRecurringDialog.set(true)"></button>
            </div>
            <div class="mb-2 grid gap-2">
              <button pButton type="button" severity="secondary" icon="pi pi-sparkles" [loading]="generatingDrafts()" label="Create upcoming drafts" (click)="generateDrafts()" ></button>
              @if (generationMessage()) {
                <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{{ generationMessage() }}</p>
              }
              @if (generatedDrafts().length > 0) {
                <div class="max-h-44 space-y-1 overflow-y-auto rounded-lg border border-teal-100 bg-white p-2">
                  @for (draft of generatedDrafts(); track draft.workOrderId) {
                    <article class="rounded-md bg-teal-50 px-2 py-1.5">
                      <div class="flex items-center justify-between gap-2">
                        <p class="truncate text-xs font-bold text-slate-950">{{ draft.workOrderNumber }} · {{ draft.title }}</p>
                        <span class="shrink-0 text-[0.7rem] font-bold text-teal-700">{{ draft.occurrenceDate }}</span>
                      </div>
                      <p class="mt-0.5 truncate text-[0.7rem] font-semibold text-slate-600">
                        {{ draft.propertyName }} · {{ draft.serviceName || 'General service' }} · {{ draft.scheduledStart ? (draft.scheduledStart | date:'h:mm a') : 'Unscheduled' }}
                      </p>
                    </article>
                  }
                </div>
              }
            </div>
            <div class="max-h-80 space-y-2 overflow-y-auto pr-1">
              @for (template of recurringTemplates(); track template.id) {
                <article class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 truncate text-sm font-bold text-slate-950">{{ template.title }}</p>
                    <p-tag [value]="template.recurrenceRule.toLowerCase()" severity="secondary" />
                  </div>
                  <p class="mt-1 truncate text-xs font-semibold text-slate-600">{{ template.propertyName }} · {{ template.serviceName || 'General service' }}</p>
                  <p class="mt-1 truncate text-xs text-slate-500">Next due {{ nextDueLabel(template) }} · lead {{ template.generateDaysAhead }} days</p>
                </article>
              } @empty {
                <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No recurring templates yet.</p>
              }
            </div>
          </div>
        </aside>

        <div class="min-w-0 space-y-3">
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div class="grid min-w-[70rem] grid-cols-7 divide-x divide-slate-200">
              @for (day of weekDays(); track day.toISOString()) {
                <section class="min-h-[24rem]">
                  <div class="border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <p class="text-xs font-bold uppercase tracking-wide text-slate-500">{{ day | date:'EEE' }}</p>
                    <p class="text-lg font-bold text-slate-950">{{ day | date:'MMM d' }}</p>
                  </div>
                  <div class="space-y-2 p-2">
                    @for (workOrder of scheduledForDay(day); track workOrder.id) {
                      <article class="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
                        <div class="flex items-start justify-between gap-2">
                          <p class="min-w-0 truncate text-sm font-bold text-slate-950">{{ workOrder.title }}</p>
                          <p-tag [value]="workOrder.priority" [severity]="workOrder.priority === 'URGENT' || workOrder.priority === 'HIGH' ? 'warn' : 'secondary'" />
                        </div>
                        <p class="mt-1 text-[0.7rem] font-bold text-teal-700">{{ workOrder.workOrderNumber }}</p>
                        <p class="mt-1 text-xs font-semibold text-teal-700">{{ workOrder.scheduledStart | date:'h:mm a' }}{{ workOrder.scheduledEnd ? ' - ' + (workOrder.scheduledEnd | date:'h:mm a') : '' }}</p>
                        <p class="mt-1 truncate text-xs text-slate-500">{{ workOrder.propertyName }}</p>
                        <div class="mt-2 flex flex-wrap gap-1">
                          @for (assignment of workOrder.assignments.slice(0, 2); track assignment.workerId) {
                            <span class="rounded-full bg-slate-100 px-2 py-1 text-[0.7rem] font-bold text-slate-700">{{ assignment.workerName }}</span>
                          } @empty {
                            <span class="rounded-full bg-amber-100 px-2 py-1 text-[0.7rem] font-bold text-amber-700">No worker</span>
                          }
                        </div>
                        <button pButton type="button" size="small" severity="secondary" class="mt-2 w-full" icon="pi pi-pencil" label="Adjust" (click)="openPlanner(workOrder)"></button>
                      </article>
                    } @empty {
                      <p class="rounded-lg border border-dashed border-slate-200 px-3 py-8 text-center text-xs font-semibold text-slate-400">Open capacity</p>
                    }
                  </div>
                </section>
              }
            </div>
          </div>

          <section class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 class="text-sm font-bold uppercase tracking-wide text-slate-500">Worker capacity</h2>
              <span class="text-xs font-semibold text-slate-500">Based on active workers, shift templates, and scheduled work orders</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[58rem] border-collapse text-sm">
                <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-3 py-2">Worker</th>
                    @for (day of weekDays(); track day.toISOString()) {
                      <th class="px-3 py-2">{{ day | date:'EEE d' }}</th>
                    }
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (worker of workers(); track worker.id) {
                    <tr class="hover:bg-slate-50">
                      <td class="px-3 py-2">
                        <p class="font-bold text-slate-950">{{ worker.displayName }}</p>
                        <p class="text-xs font-semibold text-slate-500">{{ engagementLabel(worker.engagementType) }}</p>
                      </td>
                      @for (day of weekDays(); track day.toISOString()) {
                        <td class="px-3 py-2">
                          <div class="rounded-lg border px-2 py-1.5" [class]="capacityClass(worker, day)">
                            <p class="text-xs font-bold">{{ workerJobs(worker, day).length }} jobs</p>
                            <p class="text-[0.7rem] font-semibold">{{ shiftLabel(worker, day) }}</p>
                          </div>
                        </td>
                      }
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="8" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No active workers.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <p-dialog
        header="Schedule and assign"
        [modal]="true"
        [visible]="!!planningWorkOrder()"
        [style]="{ width: 'min(46rem, 94vw)' }"
        (visibleChange)="!$event && closePlanner()"
      >
        @if (planningWorkOrder(); as workOrder) {
          <form class="space-y-3" (ngSubmit)="savePlanner()">
            <div>
              <h2 class="text-lg font-bold text-slate-950">{{ workOrder.title }}</h2>
              <p class="mt-0.5 text-sm font-bold text-teal-700">{{ workOrder.workOrderNumber }}</p>
              <p class="mt-0.5 text-sm font-semibold text-slate-500">{{ workOrder.propertyName }} · {{ workOrder.serviceName || 'General service' }}</p>
            </div>

            @if (planningError()) {
              <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ planningError() }}</p>
            }

            <div class="grid gap-2 md:grid-cols-3">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Start</span>
                <input class="w-full border border-slate-300 px-3 py-2" name="planningStart" type="datetime-local" required [(ngModel)]="planningStart" (ngModelChange)="serverAvailability.set({})" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">End</span>
                <input class="w-full border border-slate-300 px-3 py-2" name="planningEnd" type="datetime-local" required [(ngModel)]="planningEnd" (ngModelChange)="serverAvailability.set({})" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Status</span>
                <select class="w-full border border-slate-300 px-3 py-2" name="planningStatus" [(ngModel)]="planningStatus">
                  <option value="TO_DO">To do</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="ASSIGNED">Assigned</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="PENDING">Pending</option>
                </select>
              </label>
            </div>

            <div class="grid gap-2 md:grid-cols-[1fr_10rem]">
              <input pInputText class="w-full" name="plannerWorkerSearch" placeholder="Search workers, skills, phone..." [(ngModel)]="plannerWorkerSearch" />
              <div class="grid gap-2 sm:grid-cols-[1fr_auto]">
                <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="plannerAvailabilityFilter" [(ngModel)]="plannerAvailabilityFilter">
                  <option value="AVAILABLE">Available</option>
                  <option value="ALL">All workers</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                </select>
                <button pButton type="button" severity="secondary" icon="pi pi-search" [loading]="checkingAvailability()" label="Check" (click)="refreshAvailability()"></button>
              </div>
            </div>

            <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
              @for (worker of plannerWorkers(); track worker.id) {
                <label class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <input type="checkbox" [checked]="plannerWorkerIds.has(worker.id)" (change)="togglePlannerWorker(worker.id, $event)" />
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-bold text-slate-950">{{ worker.displayName }}</span>
                    <span class="block truncate text-xs font-semibold" [class]="plannerAvailability(worker).available ? 'text-teal-700' : 'text-amber-700'">
                      {{ engagementLabel(worker.engagementType) }} · {{ plannerAvailability(worker).label }}
                    </span>
                  </span>
                  <input type="radio" name="plannerLeadWorkerId" [value]="worker.id" [disabled]="!plannerWorkerIds.has(worker.id)" [(ngModel)]="plannerLeadWorkerId" />
                </label>
              } @empty {
                <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-8 text-center text-sm font-semibold text-amber-700">No workers match this schedule and service.</p>
              }
            </div>

            <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closePlanner()"></button>
              <button pButton type="submit" icon="pi pi-save" label="Save schedule" [loading]="savingPlanner()"></button>
            </div>
          </form>
        }
      </p-dialog>

      <p-dialog
        header="Add recurring work template"
        [modal]="true"
        [visible]="showRecurringDialog()"
        [style]="{ width: 'min(44rem, 94vw)' }"
        (visibleChange)="onRecurringDialogVisible($event)"
      >
        <form class="space-y-3" (ngSubmit)="createRecurringTemplate()">
          @if (recurringError()) {
            <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ recurringError() }}</p>
          }

          <div class="grid gap-2 md:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Property</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="templatePropertyId" required [(ngModel)]="recurringForm.propertyId" (ngModelChange)="recurringForm.serviceTypeId = ''">
                <option value="">Select property</option>
                @for (property of properties(); track property.id) {
                  <option [value]="property.id">{{ property.name }} · {{ property.ownerName }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Service</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="templateServiceTypeId" [(ngModel)]="recurringForm.serviceTypeId">
                <option value="">General service</option>
                @for (service of recurringServiceOptions(); track service.id) {
                  <option [value]="service.id">{{ service.name }}{{ service.categoryName ? ' · ' + service.categoryName : '' }}</option>
                }
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Title</span>
            <input pInputText class="w-full" name="templateTitle" required [(ngModel)]="recurringForm.title" />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Description</span>
            <textarea class="w-full border border-slate-300 px-3 py-2" name="templateDescription" rows="2" [(ngModel)]="recurringForm.description"></textarea>
          </label>

          <div class="grid gap-2 md:grid-cols-4">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Frequency</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="templateRule" [(ngModel)]="recurringForm.recurrenceRule">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Every</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templateInterval" type="number" min="1" [(ngModel)]="recurringForm.recurrenceInterval" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Priority</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="templatePriority" [(ngModel)]="recurringForm.priority">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Lead days</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templateLeadDays" type="number" min="1" [(ngModel)]="recurringForm.generateDaysAhead" />
            </label>
          </div>

          <div class="grid gap-2 md:grid-cols-4">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Start date</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templateStartDate" type="date" required [(ngModel)]="recurringForm.startDate" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">End date</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templateEndDate" type="date" [(ngModel)]="recurringForm.endDate" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Start time</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templatePreferredStartTime" type="time" [(ngModel)]="recurringForm.preferredStartTime" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Duration</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="templateDurationMinutes" type="number" min="15" step="15" [(ngModel)]="recurringForm.durationMinutes" />
            </label>
          </div>

          <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="onRecurringDialogVisible(false)"></button>
            <button pButton type="submit" icon="pi pi-save" label="Create template" [loading]="savingRecurring()"></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class DispatchSchedulePageComponent {
  private readonly workOrderService = inject(WorkOrderService);
  private readonly workerManagementService = inject(WorkerManagementService);
  private readonly recurringWorkService = inject(RecurringWorkService);
  private readonly propertyService = inject(PropertyService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);

  protected readonly selectedDate = signal(toDateInput(new Date()));
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly recurringTemplates = signal<RecurringWorkTemplate[]>([]);
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly error = signal('');
  protected readonly planningWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly savingPlanner = signal(false);
  protected readonly checkingAvailability = signal(false);
  protected readonly planningError = signal('');
  protected readonly serverAvailability = signal<Record<string, WorkerAvailabilityOption>>({});
  protected planningStart = '';
  protected planningEnd = '';
  protected planningStatus: WorkOrderStatus = 'TO_DO';
  protected plannerWorkerSearch = '';
  protected plannerAvailabilityFilter = 'AVAILABLE';
  protected plannerWorkerIds = new Set<string>();
  protected plannerLeadWorkerId = '';
  protected readonly showRecurringDialog = signal(false);
  protected readonly savingRecurring = signal(false);
  protected readonly recurringError = signal('');
  protected readonly generatingDrafts = signal(false);
  protected readonly generationMessage = signal('');
  protected readonly generatedDrafts = signal<GeneratedRecurringDraft[]>([]);
  protected recurringForm: CreateRecurringWorkTemplateRequest = this.blankRecurringForm();

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      const [workOrders, workers, recurringTemplates, properties, catalog] = await Promise.all([
        firstValueFrom(this.workOrderService.list()),
        firstValueFrom(this.workerManagementService.list()),
        firstValueFrom(this.recurringWorkService.list()),
        firstValueFrom(this.propertyService.list()),
        firstValueFrom(this.serviceCatalogService.catalog())
      ]);
      this.workOrders.set(workOrders);
      this.workers.set(workers.filter((worker) => worker.status === 'ACTIVE'));
      this.recurringTemplates.set(recurringTemplates);
      this.properties.set(properties);
      this.serviceTypes.set(catalog.serviceTypes);
    } catch {
      this.error.set('Unable to load schedule. Check backend status and tenant permissions.');
    }
  }

  protected moveWeek(direction: number): void {
    const date = parseDateInput(this.selectedDate());
    date.setDate(date.getDate() + direction * 7);
    this.selectedDate.set(toDateInput(date));
  }

  protected weekDays(): Date[] {
    const anchor = parseDateInput(this.selectedDate());
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      return day;
    });
  }

  protected scheduledThisWeek(): WorkOrderRecord[] {
    const [start, end] = weekBounds(this.selectedDate());
    return this.workOrders().filter((workOrder) => {
      const schedule = dateValue(workOrder.scheduledStart);
      return schedule >= start.getTime() && schedule < end.getTime();
    });
  }

  protected unscheduledQueue(): WorkOrderRecord[] {
    return this.workOrders()
      .filter((workOrder) => !workOrder.scheduledStart || workOrder.status === 'DRAFT' || workOrder.status === 'PENDING')
      .sort((left, right) => priorityValue(right.priority) - priorityValue(left.priority) || left.title.localeCompare(right.title));
  }

  protected scheduledForDay(day: Date): WorkOrderRecord[] {
    return this.workOrders()
      .filter((workOrder) => workOrder.scheduledStart && sameDay(new Date(workOrder.scheduledStart), day))
      .sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart));
  }

  protected workerJobs(worker: WorkerRecord, day: Date): WorkOrderRecord[] {
    return this.scheduledForDay(day).filter((workOrder) => workOrder.assignments.some((assignment) => assignment.workerId === worker.id));
  }

  protected shiftLabel(worker: WorkerRecord, day: Date): string {
    const dayOfWeek = day.getDay() === 0 ? 7 : day.getDay();
    const shifts = worker.shifts.filter((shift) => shift.active && shift.dayOfWeek === dayOfWeek);
    if (shifts.length === 0) {
      return 'No shift';
    }
    return shifts.map((shift) => `${shift.startTime.slice(0, 5)}-${shift.endTime.slice(0, 5)}`).join(', ');
  }

  protected capacityClass(worker: WorkerRecord, day: Date): string {
    const jobCount = this.workerJobs(worker, day).length;
    const hasShift = this.shiftLabel(worker, day) !== 'No shift';
    if (!hasShift && jobCount > 0) {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    if (!hasShift) {
      return 'border-slate-200 bg-slate-50 text-slate-400';
    }
    if (jobCount >= 4) {
      return 'border-amber-200 bg-amber-50 text-amber-700';
    }
    if (jobCount > 0) {
      return 'border-teal-200 bg-teal-50 text-teal-700';
    }
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  protected statusLabel(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected sourceLabel(source: string): string {
    return source.toLowerCase().replaceAll('_', ' ');
  }

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'COMPLETED' || status === 'APPROVED' || status === 'CUSTOMER_NOTIFIED') {
      return 'success';
    }
    if (status === 'ON_HOLD' || status === 'PAUSED' || status === 'PENDING') {
      return 'warn';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  protected recurringServiceOptions(): ServiceType[] {
    const property = this.properties().find((candidate) => candidate.id === this.recurringForm.propertyId);
    if (!property || property.services.length === 0) {
      return this.serviceTypes();
    }
    const serviceIds = new Set(property.services.map((service) => service.serviceTypeId));
    return this.serviceTypes().filter((service) => serviceIds.has(service.id));
  }

  protected onRecurringDialogVisible(visible: boolean): void {
    this.showRecurringDialog.set(visible);
    if (!visible) {
      this.recurringError.set('');
      this.recurringForm = this.blankRecurringForm();
    }
  }

  protected async createRecurringTemplate(): Promise<void> {
    if (this.savingRecurring() || !this.recurringForm.propertyId || !this.recurringForm.title.trim()) {
      return;
    }
    this.savingRecurring.set(true);
    this.recurringError.set('');
    try {
      const template = await firstValueFrom(this.recurringWorkService.create({
        ...this.recurringForm,
        serviceTypeId: this.recurringForm.serviceTypeId || undefined,
        title: this.recurringForm.title.trim(),
        description: this.recurringForm.description?.trim() || undefined,
        endDate: this.recurringForm.endDate || undefined,
        preferredStartTime: this.recurringForm.preferredStartTime || undefined
      }));
      this.recurringTemplates.update((templates) => [template, ...templates]);
      this.onRecurringDialogVisible(false);
    } catch (exception) {
      this.recurringError.set(apiErrorMessage(exception, 'Unable to create recurring template.'));
    } finally {
      this.savingRecurring.set(false);
    }
  }

  protected async generateDrafts(): Promise<void> {
    if (this.generatingDrafts()) {
      return;
    }
    this.generatingDrafts.set(true);
    this.generationMessage.set('');
    this.generatedDrafts.set([]);
    this.error.set('');
    try {
      const through = toDateInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
      const result = await firstValueFrom(this.recurringWorkService.generateDrafts(through));
      this.generatedDrafts.set(result.drafts ?? []);
      const [workOrders, templates] = await Promise.all([
        firstValueFrom(this.workOrderService.list()),
        firstValueFrom(this.recurringWorkService.list())
      ]);
      this.workOrders.set(workOrders);
      this.recurringTemplates.set(templates);
      const queuedRecurringDrafts = this.recurringDraftCount();
      this.generationMessage.set(result.generatedCount > 0
        ? `${result.generatedCount} new draft work orders created through ${result.throughDate}.`
        : `0 new drafts created through ${result.throughDate}; ${queuedRecurringDrafts} recurring drafts are already in the queue.`
      );
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to generate recurring draft work orders.'));
    } finally {
      this.generatingDrafts.set(false);
    }
  }

  protected openPlanner(workOrder: WorkOrderRecord): void {
    const fallback = defaultScheduleWindow(this.selectedDate());
    this.planningWorkOrder.set(workOrder);
    this.planningError.set('');
    this.planningStart = toDateTimeInput(workOrder.scheduledStart) || fallback.start;
    this.planningEnd = toDateTimeInput(workOrder.scheduledEnd) || fallback.end;
    this.planningStatus = defaultPlanningStatus(workOrder);
    this.plannerWorkerSearch = '';
    this.plannerAvailabilityFilter = 'AVAILABLE';
    this.plannerWorkerIds = new Set(workOrder.assignments.map((assignment) => assignment.workerId));
    this.plannerLeadWorkerId = workOrder.assignments.find((assignment) => assignment.leadWorker)?.workerId || workOrder.assignments[0]?.workerId || '';
    void this.refreshAvailability();
  }

  protected closePlanner(): void {
    this.planningWorkOrder.set(null);
    this.planningError.set('');
    this.savingPlanner.set(false);
    this.checkingAvailability.set(false);
    this.serverAvailability.set({});
    this.plannerWorkerIds.clear();
    this.plannerLeadWorkerId = '';
  }

  protected plannerWorkers(): WorkerRecord[] {
    const workOrder = this.planningWorkOrder();
    const query = normalized(this.plannerWorkerSearch);
    return this.workers().filter((worker) => {
      const availability = this.plannerAvailability(worker);
      const matchesService = !workOrder?.serviceTypeId || worker.serviceSkills.some((skill) => skill.serviceTypeId === workOrder.serviceTypeId);
      const matchesSearch = !query || normalized([
        worker.displayName,
        worker.employeeNumber,
        worker.phone,
        worker.email,
        worker.engagementType,
        ...worker.serviceSkills.map((skill) => skill.serviceName)
      ].filter(Boolean).join(' ')).includes(query);
      const matchesAvailability = this.plannerAvailabilityFilter === 'ALL'
        || (this.plannerAvailabilityFilter === 'AVAILABLE' && availability.available)
        || (this.plannerAvailabilityFilter === 'UNAVAILABLE' && !availability.available);
      return matchesService && matchesSearch && matchesAvailability;
    }).sort((left, right) => {
      const selectedCompare = Number(this.plannerWorkerIds.has(right.id)) - Number(this.plannerWorkerIds.has(left.id));
      if (selectedCompare !== 0) {
        return selectedCompare;
      }
      const availabilityCompare = Number(this.plannerAvailability(right).available) - Number(this.plannerAvailability(left).available);
      return availabilityCompare !== 0 ? availabilityCompare : left.displayName.localeCompare(right.displayName);
    });
  }

  protected plannerAvailability(worker: WorkerRecord): WorkerAvailability {
    const server = this.serverAvailability()[worker.id];
    if (server) {
      return { available: server.available, label: server.reason };
    }
    if (!this.planningStart || !this.planningEnd) {
      return { available: true, label: 'Schedule open' };
    }
    if (!coversShift(worker, this.planningStart, this.planningEnd)) {
      return { available: false, label: 'Outside shift' };
    }
    if (this.hasPlannerConflict(worker.id)) {
      return { available: false, label: 'Conflict' };
    }
    return { available: true, label: 'Available' };
  }

  protected async refreshAvailability(): Promise<void> {
    const workOrder = this.planningWorkOrder();
    if (!workOrder || this.checkingAvailability()) {
      return;
    }
    this.checkingAvailability.set(true);
    this.planningError.set('');
    try {
      const availability = await firstValueFrom(this.workOrderService.availability({
        workOrderId: workOrder.id,
        serviceTypeId: workOrder.serviceTypeId,
        scheduledStart: this.planningStart ? new Date(this.planningStart).toISOString() : undefined,
        scheduledEnd: this.planningEnd ? new Date(this.planningEnd).toISOString() : undefined
      }));
      this.serverAvailability.set(Object.fromEntries(availability.map((option) => [option.workerId, option])));
    } catch (exception) {
      this.planningError.set(apiErrorMessage(exception, 'Unable to check worker availability.'));
    } finally {
      this.checkingAvailability.set(false);
    }
  }

  protected togglePlannerWorker(workerId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) {
      this.plannerWorkerIds.add(workerId);
      this.plannerLeadWorkerId ||= workerId;
      return;
    }
    this.plannerWorkerIds.delete(workerId);
    if (this.plannerLeadWorkerId === workerId) {
      this.plannerLeadWorkerId = [...this.plannerWorkerIds][0] || '';
    }
  }

  protected async savePlanner(): Promise<void> {
    const workOrder = this.planningWorkOrder();
    if (!workOrder || this.savingPlanner()) {
      return;
    }
    this.savingPlanner.set(true);
    this.planningError.set('');
    try {
      const updated = await firstValueFrom(this.workOrderService.update(workOrder.id, this.plannerRequest(workOrder)));
      this.workOrders.update((workOrders) => workOrders.map((candidate) => candidate.id === updated.id ? updated : candidate));
      this.closePlanner();
    } catch (exception) {
      this.planningError.set(apiErrorMessage(exception, 'Unable to save schedule. Check worker availability and schedule window.'));
    } finally {
      this.savingPlanner.set(false);
    }
  }

  private hasPlannerConflict(workerId: string): boolean {
    const workOrder = this.planningWorkOrder();
    if (!workOrder || !this.planningStart || !this.planningEnd) {
      return false;
    }
    const start = new Date(this.planningStart).getTime();
    const end = new Date(this.planningEnd).getTime();
    return this.workOrders().some((candidate) => {
      if (candidate.id === workOrder.id || !candidate.scheduledStart || !candidate.scheduledEnd) {
        return false;
      }
      if (candidate.status === 'CANCELLED' || candidate.status === 'COMPLETED') {
        return false;
      }
      if (!candidate.assignments.some((assignment) => assignment.workerId === workerId)) {
        return false;
      }
      return start < new Date(candidate.scheduledEnd).getTime() && end > new Date(candidate.scheduledStart).getTime();
    });
  }

  private plannerRequest(workOrder: WorkOrderRecord): CreateWorkOrderRequest {
    const workerIds = [...this.plannerWorkerIds];
    return {
      propertyId: workOrder.propertyId,
      serviceTypeId: workOrder.serviceTypeId,
      title: workOrder.title,
      description: workOrder.description,
      source: workOrder.source,
      status: this.planningStatus,
      priority: workOrder.priority,
      scheduledStart: this.planningStart ? new Date(this.planningStart).toISOString() : undefined,
      scheduledEnd: this.planningEnd ? new Date(this.planningEnd).toISOString() : undefined,
      requesterName: workOrder.requesterName,
      requesterEmail: workOrder.requesterEmail,
      requesterPhone: workOrder.requesterPhone,
      recurrenceRule: workOrder.recurrenceRule,
      recurrenceInterval: workOrder.recurrenceInterval,
      recurrenceUntil: workOrder.recurrenceUntil,
      assignedWorkerId: workerIds[0],
      assignedWorkerIds: workerIds,
      leadWorkerId: this.plannerLeadWorkerId || workerIds[0],
      materials: workOrder.materials.map((material) => ({
        inventoryItemId: material.inventoryItemId,
        description: material.description,
        quantity: material.quantity,
        unitCost: material.unitCost
      })),
      assetIds: workOrder.assets.map((asset) => asset.assetId),
      tasks: [],
      taskItems: []
    };
  }

  private blankRecurringForm(): CreateRecurringWorkTemplateRequest {
    return {
      propertyId: '',
      serviceTypeId: '',
      title: '',
      description: '',
      priority: 'NORMAL',
      recurrenceRule: 'WEEKLY',
      recurrenceInterval: 1,
      startDate: toDateInput(new Date()),
      endDate: '',
      preferredStartTime: '09:00',
      durationMinutes: 60,
      generateDaysAhead: 7
    };
  }

  protected recurringDraftCount(): number {
    return this.workOrders().filter((workOrder) => workOrder.source === 'RECURRING' && workOrder.status === 'DRAFT').length;
  }

  protected nextDueLabel(template: RecurringWorkTemplate): string {
    const date = nextTemplateDate(template);
    return date ? toDateInput(date) : 'not scheduled';
  }
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateInput(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekBounds(value: string): [Date, Date] {
  const start = startOfWeek(parseDateInput(value));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return [start, end];
}

function sameDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function priorityValue(priority: WorkOrderRecord['priority']): number {
  return { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 }[priority] ?? 0;
}

function nextTemplateDate(template: RecurringWorkTemplate): Date | null {
  const today = parseDateInput(toDateInput(new Date()));
  const endDate = template.endDate ? parseDateInput(template.endDate) : null;
  let date = template.lastGeneratedFor
    ? nextRecurrenceDate(parseDateInput(template.lastGeneratedFor), template)
    : parseDateInput(template.startDate);
  while (date < today) {
    date = nextRecurrenceDate(date, template);
  }
  if (endDate && date > endDate) {
    return null;
  }
  return date;
}

function nextRecurrenceDate(date: Date, template: RecurringWorkTemplate): Date {
  const next = new Date(date);
  const interval = Math.max(1, template.recurrenceInterval || 1);
  if (template.recurrenceRule === 'DAILY') {
    next.setDate(next.getDate() + interval);
  } else if (template.recurrenceRule === 'WEEKLY') {
    next.setDate(next.getDate() + interval * 7);
  } else {
    next.setMonth(next.getMonth() + interval);
  }
  return next;
}

function defaultPlanningStatus(workOrder: WorkOrderRecord): WorkOrderStatus {
  if (workOrder.assignments.length > 0) {
    return 'ASSIGNED';
  }
  if (workOrder.scheduledStart) {
    return 'SCHEDULED';
  }
  return 'TO_DO';
}

function defaultScheduleWindow(selectedDate: string): { start: string; end: string } {
  const start = parseDateInput(selectedDate);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return { start: toDateTimeInput(start.toISOString()), end: toDateTimeInput(end.toISOString()) };
}

function toDateTimeInput(value?: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function coversShift(worker: WorkerRecord, scheduledStart: string, scheduledEnd: string): boolean {
  const start = new Date(scheduledStart);
  const end = new Date(scheduledEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.toDateString() !== end.toDateString()) {
    return false;
  }
  const dayOfWeek = start.getDay() === 0 ? 7 : start.getDay();
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  return worker.shifts.some((shift) => shift.active && shift.dayOfWeek === dayOfWeek && timeMinutes(shift.startTime) <= startMinutes && timeMinutes(shift.endTime) >= endMinutes);
}

function timeMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
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

interface WorkerAvailability {
  available: boolean;
  label: string;
}
