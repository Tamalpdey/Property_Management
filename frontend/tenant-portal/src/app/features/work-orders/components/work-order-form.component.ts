import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import type {
  WorkOrderStatus,
  WorkOrderSource,
  PropertyRecord,
  ServiceType,
  InventoryItem,
  TenantAsset,
  WorkerRecord,
  WorkOrderRecord,
  WorkOrderType,
  CreateWorkOrderRequest
} from '@lorne/contracts';

type ChecklistPhase = 'PRE_START' | 'COMPLETION';
type ResourceTab = 'INVENTORY' | 'TOOLS';
type RouteStopType = 'PICKUP' | 'DELIVERY' | 'RETURN' | 'KEYS' | 'SUPPLIER' | 'WAREHOUSE' | 'OWNER' | 'OTHER';
type WorkOrderLinkType = 'RELATED' | 'BLOCKS' | 'FOLLOWS' | 'SAME_RECURRENCE' | 'PICKUP_FOR';

@Component({
  selector: 'lorne-work-order-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex h-full min-h-0 flex-col gap-3" (ngSubmit)="submit()">
      <div class="flex-none">
        <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Work order</p>
        <h2 class="mt-0.5 text-lg font-bold text-slate-950">{{ workOrder() ? 'Update work order' : 'Create work order' }}</h2>
      </div>

      @if (isLockedWorkOrder()) {
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          {{ lockedWorkOrderMessage() }}
        </p>
      }

      @if (saveError()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ saveError() }}</p>
      }
      @if (formError) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ formError }}</p>
      }

      <fieldset class="flex min-h-0 flex-1 flex-col gap-3" [disabled]="isLockedWorkOrder()">
      <div class="flex-none grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5" [style.grid-template-columns]="'repeat(' + currentSteps().length + ', minmax(0, 1fr))'">
        @for (stepLabel of currentSteps(); track stepLabel; let index = $index) {
          <button
            pButton
            type="button"
            size="small"
            [severity]="step === index ? 'primary' : 'secondary'"
            [text]="step !== index"
            [label]="stepLabel"
            (click)="setStep(index)"
          ></button>
        }
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
      @if (step === 0) {
        <div class="grid gap-2">
          <p class="text-xs font-semibold text-slate-500"><span class="font-black text-red-600">*</span> Required field</p>
          @if (form.workOrderType !== 'SERVICE') {
            <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[13rem_1fr]">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Work type</span>
                <select class="w-full border border-slate-300 px-3 py-2" name="workOrderType" [(ngModel)]="form.workOrderType" (ngModelChange)="onWorkOrderTypeChange()">
                  <option value="SERVICE">Service work</option>
                  <option value="PICKUP_DELIVERY">Pickup / delivery</option>
                  <option value="INSPECTION">Inspection</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                </select>
              </label>
              <div class="rounded-lg border border-white bg-white px-3 py-2">
                <p class="text-sm font-bold text-slate-950">{{ workOrderTypeLabel(form.workOrderType) }}</p>
                <p class="mt-0.5 text-xs font-semibold leading-5 text-slate-500">{{ workOrderTypeHelp(form.workOrderType) }}</p>
              </div>
            </div>
          }
          <div class="grid gap-2 md:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Owner <span class="text-red-600">*</span></span>
              <select class="w-full border border-slate-300 px-3 py-2" name="ownerId" required [(ngModel)]="ownerId" (ngModelChange)="onOwnerChange()">
                <option value="">Select owner</option>
                @for (owner of ownerOptions(); track owner.id) {
                  <option [value]="owner.id">{{ owner.name }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Property <span class="text-red-600">*</span></span>
              <select class="w-full border border-slate-300 px-3 py-2" name="propertyId" required [(ngModel)]="form.propertyId" (ngModelChange)="onPropertyChange()">
                <option value="">Select property</option>
                @for (property of propertyOptions(); track property.id) {
                  <option [value]="property.id">{{ property.name }} · {{ property.addressLine1 }}</option>
                }
              </select>
            </label>
          </div>

          @if (selectedProperty(); as property) {
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {{ property.ownerName }} · {{ property.addressLine1 }}, {{ property.city }}
            </div>
          }

          @if (form.workOrderType === 'PICKUP_DELIVERY') {
            <section class="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="text-sm font-black text-amber-950">Pickup / delivery job</p>
                  <p class="text-xs font-semibold text-amber-800">Use this for supplier runs, key pickup, parts delivery, returns to base, or a pickup linked to another work order.</p>
                </div>
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-map-marker" label="Add pickup stop" (click)="addPickupStop()"></button>
              </div>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-amber-950">Pickup for existing work order</span>
                <select class="w-full border border-amber-300 px-3 py-2" name="pickupForWorkOrderId" [(ngModel)]="pickupForWorkOrderId" (ngModelChange)="syncPickupLink()">
                  <option value="">Not linked yet</option>
                  @for (candidate of linkableWorkOrders(); track candidate.id) {
                    <option [value]="candidate.id">{{ linkLabel(candidate) }}</option>
                  }
                </select>
              </label>
              @if (routeStopRows.length) {
                <p class="text-xs font-bold text-amber-900">{{ routeStopRows.length }} stop{{ routeStopRows.length === 1 ? '' : 's' }} will drive the worker pickup route. The worker closes each stop, then completes the pickup job.</p>
              }
            </section>
          }

          <div class="grid gap-2 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Source</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="source" [(ngModel)]="form.source">
                <option value="TENANT_PORTAL">Tenant portal</option>
                <option value="ADHOC_CALL">Adhoc call</option>
                <option value="WEBSITE">Website</option>
                <option value="CUSTOMER_PORTAL">Customer portal</option>
                @if (workOrder()?.source === 'RECURRING') {
                  <option value="RECURRING">Recurring template draft</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Status</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="status" [(ngModel)]="form.status">
                <option value="DRAFT">Draft</option>
                <option value="TO_DO">To do</option>
                <option value="PENDING">Pending</option>
                <option value="ON_HOLD">On hold</option>
                <option value="PENDING_COMPLETION">Pending completion</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Service</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="serviceTypeId" [(ngModel)]="form.serviceTypeId" (ngModelChange)="onServiceChange()">
                <option value="">General service</option>
                @for (service of serviceOptions(); track service.id) {
                  <option [value]="service.id">{{ service.name }}{{ service.categoryName ? ' · ' + service.categoryName : '' }}</option>
                }
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Work order title <span class="text-red-600">*</span></span>
            <input pInputText class="w-full" name="title" required [ngModel]="form.title" (ngModelChange)="onTitleChange($event)" />
          </label>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Dispatch instructions</span>
            <textarea class="w-full border border-slate-300 px-3 py-2" name="description" rows="2" [(ngModel)]="form.description"></textarea>
          </label>

          <div class="grid gap-2 md:grid-cols-3">
            <input pInputText class="w-full" name="requesterName" placeholder="Requester name" [(ngModel)]="form.requesterName" />
            <input pInputText class="w-full" name="requesterPhone" placeholder="Requester phone" [(ngModel)]="form.requesterPhone" />
            <input pInputText class="w-full" name="requesterEmail" type="email" placeholder="Requester email" [(ngModel)]="form.requesterEmail" />
          </div>
        </div>
      }

          @if (step === 1) {
        <div class="grid gap-2">
          <div class="grid gap-2 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Priority</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="priority" [(ngModel)]="form.priority">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Start</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="scheduledStart" type="datetime-local" [(ngModel)]="scheduledStart" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">End</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="scheduledEnd" type="datetime-local" [(ngModel)]="scheduledEnd" />
            </label>
          </div>
          @if (workOrder()?.source === 'RECURRING') {
            <p class="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
              This is a draft generated from a recurring work template. Recurrence rules are managed from the Schedule board.
            </p>
          }
          @if (form.workOrderType === 'PICKUP_DELIVERY') {
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
              Pickup orders are one-off dispatch work. Add the real stops: pickup, delivery, return, supplier, warehouse, or keys.
            </p>
          }

          @if (form.workOrderType !== 'PICKUP_DELIVERY') {
          <section class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Recurrence</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="recurrenceRule" [(ngModel)]="form.recurrenceRule">
                <option value="">None</option>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Every</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="recurrenceInterval" type="number" min="1" [(ngModel)]="form.recurrenceInterval" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Until</span>
              <input class="w-full border border-slate-300 px-3 py-2" name="recurrenceUntil" type="date" [(ngModel)]="form.recurrenceUntil" />
            </label>
          </section>
          }

          <section class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-bold text-slate-950">Route stops before site</p>
                <p class="text-xs font-semibold text-slate-500">{{ form.workOrderType === 'PICKUP_DELIVERY' ? 'Worker visits these stops in order and marks each stop arrived, done, or skipped.' : 'Pickup keys, parts, chemicals, or supplier items before the service address.' }}</p>
              </div>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-plus" label="Add stop" (click)="addRouteStop()"></button>
            </div>
            @for (stop of routeStopRows; track stop.id; let index = $index) {
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[8rem_1fr_1fr_11rem_auto]">
                <select class="w-full border border-slate-300 px-2 py-2 text-sm" name="routeStopType{{ stop.id }}" [(ngModel)]="stop.stopType">
                  <option value="PICKUP">Pickup</option>
                  <option value="DELIVERY">Delivery</option>
                  <option value="RETURN">Return</option>
                  <option value="KEYS">Keys</option>
                  <option value="SUPPLIER">Supplier</option>
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="OWNER">Owner</option>
                  <option value="OTHER">Other</option>
                </select>
                <input pInputText class="w-full" name="routeStopName{{ stop.id }}" placeholder="Stop name" [(ngModel)]="stop.name" />
                <input pInputText class="w-full" name="routeStopAddress{{ stop.id }}" placeholder="Address or location" [(ngModel)]="stop.address" />
                <input class="w-full border border-slate-300 px-2 py-2 text-sm" name="routeStopArrival{{ stop.id }}" type="datetime-local" [(ngModel)]="stop.plannedArrival" />
                <button pButton type="button" severity="secondary" icon="pi pi-trash" [text]="true" (click)="removeRouteStop(stop.id)"></button>
                <textarea class="md:col-span-5 w-full border border-slate-300 px-3 py-2 text-sm" name="routeStopInstructions{{ stop.id }}" rows="2" placeholder="Stop instructions, confirmation notes, contact, shelf/bin, etc." [(ngModel)]="stop.instructions"></textarea>
              </div>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">No pre-site stops added.</p>
            }
          </section>

          <section class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-bold text-slate-950">Linked work orders</p>
                <p class="text-xs font-semibold text-slate-500">Show dispatch how this job depends on pickup, previous work, blocked work, or recurrence.</p>
              </div>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-plus" label="Add link" (click)="addWorkOrderLink()"></button>
            </div>
            @for (link of linkRows; track link.id) {
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
                <div class="grid gap-2 md:grid-cols-[minmax(18rem,1fr)_auto] md:items-start">
                  <label class="block">
                    <span class="mb-1 block text-xs font-black uppercase text-slate-500">Work order</span>
                    <select class="w-full border border-slate-300 px-2 py-2 text-sm" name="linkedWorkOrder{{ link.id }}" [(ngModel)]="link.linkedWorkOrderId">
                      <option value="">Select work order</option>
                      @for (candidate of linkableWorkOrders(); track candidate.id) {
                        <option [value]="candidate.id">{{ linkLabel(candidate) }}</option>
                      }
                    </select>
                    @if (linkedCandidateMeta(link); as meta) {
                      <p class="mt-1 truncate text-xs font-semibold text-slate-500">{{ meta }}</p>
                    }
                  </label>
                  <button pButton type="button" severity="secondary" icon="pi pi-trash" [text]="true" (click)="removeWorkOrderLink(link.id)"></button>
                </div>

                <div class="grid gap-2 md:grid-cols-5">
                  @for (option of linkTypeOptions; track option.value) {
                    <button
                      type="button"
                      class="rounded-lg border px-3 py-2 text-left transition"
                      [class.border-emerald-300]="link.linkType === option.value"
                      [class.bg-emerald-50]="link.linkType === option.value"
                      [class.text-emerald-900]="link.linkType === option.value"
                      [class.border-slate-200]="link.linkType !== option.value"
                      [class.bg-white]="link.linkType !== option.value"
                      [class.text-slate-600]="link.linkType !== option.value"
                      (click)="link.linkType = option.value"
                    >
                      <span class="block text-xs font-black uppercase">{{ option.label }}</span>
                      <span class="mt-0.5 block text-xs font-semibold leading-4">{{ option.shortHelp }}</span>
                    </button>
                  }
                </div>

                <div class="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <p class="text-sm font-bold text-slate-950">{{ linkTypeTitle(link.linkType) }}</p>
                  <p class="mt-0.5 text-xs font-semibold leading-5 text-slate-500">{{ linkTypeRule(link.linkType) }}</p>
                </div>

                <input pInputText class="w-full" name="linkNotes{{ link.id }}" placeholder="Internal note, reason, supplier PO, return instruction..." [(ngModel)]="link.notes" />
              </div>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">No linked work orders.</p>
            }
          </section>
        </div>
      }

      @if (step === 2) {
        <div class="grid gap-2">
          <div class="grid gap-2 md:grid-cols-[1fr_10rem_10rem]">
            <input pInputText class="w-full" name="workerSearch" placeholder="Search workers, skills, phone..." [(ngModel)]="workerSearch" />
            <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="workerEngagementFilter" [(ngModel)]="workerEngagementFilter">
              <option value="ALL">All types</option>
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACTOR">Contractor</option>
              <option value="SEASONAL">Seasonal</option>
            </select>
            <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="workerAvailabilityFilter" [(ngModel)]="workerAvailabilityFilter">
              <option value="ALL">All availability</option>
              <option value="AVAILABLE">Available</option>
              <option value="UNAVAILABLE">Unavailable</option>
            </select>
          </div>

          <label class="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
            <input class="mt-1" type="checkbox" name="allowAvailabilityOverride" [(ngModel)]="allowAvailabilityOverride" />
            <span>
              <span class="block font-black">Allow dispatch override</span>
              <span class="mt-0.5 block text-xs leading-5">Use when operations intentionally accepts overlapping work or outside-shift scheduling.</span>
            </span>
          </label>
          @if (allowAvailabilityOverride) {
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Override reason <span class="text-red-600">*</span></span>
              <textarea class="w-full border border-amber-300 px-3 py-2 text-sm font-semibold" name="availabilityOverrideReason" rows="2" [(ngModel)]="availabilityOverrideReason"></textarea>
            </label>
          }

          <div class="grid max-h-[34rem] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
          @for (worker of filteredWorkers(); track worker.id) {
            <label class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <input type="checkbox" [checked]="selectedWorkerIds.has(worker.id)" (change)="toggleWorker(worker.id, $event)" />
              <span class="min-w-0">
                <span class="block truncate text-sm font-bold text-slate-950">{{ worker.displayName }}</span>
                <span class="block truncate text-xs font-semibold text-slate-500">
                  {{ engagementLabel(worker.engagementType) }} · {{ worker.serviceSkills.length }} skills · {{ worker.shifts.length }} shifts · {{ workerAvailability(worker).label }}
                </span>
              </span>
              <input type="radio" name="leadWorkerId" [value]="worker.id" [disabled]="!selectedWorkerIds.has(worker.id)" [(ngModel)]="leadWorkerId" />
            </label>
          } @empty {
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">No eligible workers for the selected service.</p>
          }
          </div>
        </div>
      }

      @if (step === 3) {
        <div class="grid gap-2">
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-sm font-bold text-slate-950">Worker checklists</p>
              <p class="text-xs font-semibold text-slate-500">Pre-start checks block Start work. Completion checks block Complete work.</p>
            </div>
          </div>

          <div class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-bold text-slate-950">Pre-start checklist</p>
                <p class="text-xs font-semibold text-slate-500">Worker completes these before starting work on site.</p>
              </div>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-plus" label="Add pre-start" (click)="addTask('PRE_START')"></button>
            </div>
            @for (task of tasksByPhase('PRE_START'); track task.id) {
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1fr_11rem_7rem_auto]">
                <input pInputText class="w-full" name="taskLabel{{ task.id }}" placeholder="Checklist item, e.g. Capture after photo" [(ngModel)]="task.label" />
                <select class="w-full border border-slate-300 px-2 py-2 text-sm" name="taskWorker{{ task.id }}" [(ngModel)]="task.assignedWorkerId">
                  <option value="">Any assigned worker</option>
                  @for (worker of selectedWorkers(); track worker.id) {
                    <option [value]="worker.id">{{ worker.displayName }}</option>
                  }
                </select>
                <label class="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" name="taskRequired{{ task.id }}" [(ngModel)]="task.required" />
                  Required
                </label>
                <button pButton type="button" severity="secondary" icon="pi pi-trash" [text]="true" (click)="removeTask(task.id)"></button>
              </div>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                No pre-start checks.
              </p>
            }
          </div>

          <div class="grid gap-2 rounded-lg border border-slate-200 bg-white p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <p class="text-sm font-bold text-slate-950">Completion checklist</p>
                <p class="text-xs font-semibold text-slate-500">Worker completes these before submitting the work order.</p>
              </div>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-plus" label="Add completion" (click)="addTask('COMPLETION')"></button>
            </div>
            @for (task of tasksByPhase('COMPLETION'); track task.id) {
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1fr_11rem_7rem_auto]">
                <input pInputText class="w-full" name="taskLabel{{ task.id }}" placeholder="Checklist item, e.g. Capture after photo" [(ngModel)]="task.label" />
                <select class="w-full border border-slate-300 px-2 py-2 text-sm" name="taskWorker{{ task.id }}" [(ngModel)]="task.assignedWorkerId">
                  <option value="">Any assigned worker</option>
                  @for (worker of selectedWorkers(); track worker.id) {
                    <option [value]="worker.id">{{ worker.displayName }}</option>
                  }
                </select>
                <label class="flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" name="taskRequired{{ task.id }}" [(ngModel)]="task.required" />
                  Required
                </label>
                <button pButton type="button" severity="secondary" icon="pi pi-trash" [text]="true" (click)="removeTask(task.id)"></button>
              </div>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">
                No completion checks.
              </p>
            }
          </div>
        </div>
      }

      @if (step === 4) {
        <div class="grid gap-3">
          <div class="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              pButton
              type="button"
              size="small"
              icon="pi pi-box"
              label="Inventory"
              [severity]="resourceTab === 'INVENTORY' ? 'primary' : 'secondary'"
              [text]="resourceTab !== 'INVENTORY'"
              (click)="resourceTab = 'INVENTORY'"
            ></button>
            <button
              pButton
              type="button"
              size="small"
              icon="pi pi-wrench"
              label="Tools & Equipment"
              [severity]="resourceTab === 'TOOLS' ? 'primary' : 'secondary'"
              [text]="resourceTab !== 'TOOLS'"
              (click)="resourceTab = 'TOOLS'"
            ></button>
          </div>

          @if (resourceTab === 'INVENTORY') {
          <div class="space-y-2">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-bold text-slate-950">Materials and inventory</p>
                <p class="text-xs font-semibold text-slate-500">Optional. Add only when stock or billable materials are needed.</p>
              </div>
              <div class="grid gap-2 md:grid-cols-[1fr_9rem]">
                <input pInputText class="w-full" name="inventorySearch" placeholder="Search stock..." [(ngModel)]="inventorySearch" />
                <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="inventoryStockFilter" [(ngModel)]="inventoryStockFilter">
                  <option value="AVAILABLE">In stock</option>
                  <option value="LOW">Low stock</option>
                  <option value="ALL">All stock</option>
                </select>
              </div>
            </div>
            @for (material of materialRows; track material.id; let index = $index) {
              <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1fr_1fr_7rem_8rem_auto]">
                <select class="w-full border border-slate-300 px-2 py-2 text-sm" name="materialItem{{ material.id }}" [(ngModel)]="material.inventoryItemId" (ngModelChange)="syncMaterialDescription(material)">
                  <option value="">Custom material</option>
                  @for (item of inventoryOptions(material); track item.id) {
                    <option [value]="item.id">{{ item.name }} · {{ item.quantityOnHand }} {{ item.unit }}</option>
                  }
                </select>
                <input pInputText class="w-full" name="materialDescription{{ material.id }}" placeholder="Description" [(ngModel)]="material.description" />
                <input class="w-full border border-slate-300 px-2 py-2 text-sm" name="materialQuantity{{ material.id }}" type="number" min="0.01" step="0.01" [(ngModel)]="material.quantity" />
                <input class="w-full border border-slate-300 px-2 py-2 text-sm" name="materialCost{{ material.id }}" type="number" min="0" step="0.01" placeholder="Unit cost" [(ngModel)]="material.unitCost" />
                <button pButton type="button" severity="secondary" icon="pi pi-trash" [text]="true" (click)="removeMaterial(index)"></button>
              </div>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">No materials added.</p>
            }
            <button pButton type="button" severity="secondary" icon="pi pi-plus" label="Add material" (click)="addMaterial()"></button>
          </div>
          }

          @if (resourceTab === 'TOOLS') {
          <div class="grid gap-2">
            <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <p class="text-sm font-bold text-slate-950">Tools and equipment</p>
                <p class="text-xs font-semibold text-slate-500">Optional. Use availability filters for large tool lists.</p>
              </div>
              <div class="grid gap-2 md:grid-cols-[1fr_9rem_10rem]">
                <input pInputText class="w-full" name="assetSearch" placeholder="Search tools..." [(ngModel)]="assetSearch" />
                <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="assetTypeFilter" [(ngModel)]="assetTypeFilter">
                  <option value="ALL">All types</option>
                  @for (type of assetTypes(); track type) {
                    <option [value]="type">{{ type }}</option>
                  }
                </select>
                <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="assetAvailabilityFilter" [(ngModel)]="assetAvailabilityFilter">
                  <option value="AVAILABLE">Available</option>
                  <option value="UNASSIGNED">Unassigned</option>
                  <option value="SELECTED">Selected</option>
                  <option value="ALL">All tools</option>
                </select>
              </div>
            </div>
            <div class="grid max-h-64 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
            @for (asset of filteredAssets(); track asset.id) {
              <label class="grid grid-cols-[auto_1fr] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input type="checkbox" [checked]="selectedAssetIds.has(asset.id)" (change)="toggleAsset(asset.id, $event)" />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-bold text-slate-950">{{ asset.name }}</span>
                  <span class="block truncate text-xs font-semibold text-slate-500">{{ asset.assetType }} · qty {{ asset.quantityOnHand }}{{ asset.storageLocation ? ' · ' + asset.storageLocation : '' }}{{ asset.identifier ? ' · ' + asset.identifier : '' }}{{ asset.assignedWorkerName ? ' · ' + asset.assignedWorkerName : ' · unassigned' }}</span>
                </span>
              </label>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">No active tools or equipment available.</p>
            }
            </div>
          </div>
          }
        </div>
      }
      </div>

      <div class="-mx-4 -mb-4 flex flex-none justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <button pButton type="button" severity="secondary" icon="pi pi-arrow-left" label="Back" [disabled]="step === 0" (click)="setStep(step - 1)"></button>
        <div class="flex gap-2">
          @if (step < currentSteps().length - 1) {
            <button pButton type="button" severity="secondary" icon="pi pi-arrow-right" iconPos="right" label="Next" (click)="setStep(step + 1)"></button>
          }
          <button pButton type="submit" icon="pi pi-save" [disabled]="isLockedWorkOrder()" [loading]="saving()" label="Save work order"></button>
        </div>
      </div>
      </fieldset>
    </form>
  `
})
export class WorkOrderFormComponent {
  readonly properties = input.required<PropertyRecord[]>();
  readonly serviceTypes = input.required<ServiceType[]>();
  readonly workers = input.required<WorkerRecord[]>();
  readonly workOrders = input<WorkOrderRecord[]>([]);
  readonly inventoryItems = input<InventoryItem[]>([]);
  readonly assets = input<TenantAsset[]>([]);
  readonly workOrder = input<WorkOrderRecord | null>(null);
  readonly initialStep = input(0);
  readonly initialResourceTab = input<ResourceTab>('INVENTORY');
  readonly initialWorkOrderType = input<WorkOrderType>('SERVICE');
  readonly saving = input(false);
  readonly saveError = input('');
  readonly createWorkOrder = output<CreateWorkOrderRequest>();

  protected readonly steps = ['Context', 'Schedule', 'Workers', 'Checklist', 'Resources'];
  protected readonly pickupSteps = ['Pickup', 'Stops', 'Worker'];
  protected readonly linkTypeOptions = LINK_TYPE_OPTIONS;
  protected step = 0;
  protected resourceTab: ResourceTab = 'INVENTORY';
  protected ownerId = '';
  protected form: CreateWorkOrderRequest = this.blankForm('SERVICE');
  protected scheduledStart = '';
  protected scheduledEnd = '';
  protected readonly selectedWorkerIds = new Set<string>();
  protected readonly selectedAssetIds = new Set<string>();
  protected leadWorkerId = '';
  protected materialRows: MaterialRow[] = [];
  protected taskRows: TaskRow[] = defaultCompletionTasks();
  protected routeStopRows: RouteStopRow[] = [];
  protected linkRows: LinkRow[] = [];
  protected pickupForWorkOrderId = '';
  protected workerSearch = '';
  protected workerEngagementFilter = 'ALL';
  protected workerAvailabilityFilter = 'AVAILABLE';
  protected allowAvailabilityOverride = false;
  protected availabilityOverrideReason = '';
  protected formError = '';
  protected inventorySearch = '';
  protected inventoryStockFilter = 'AVAILABLE';
  protected assetSearch = '';
  protected assetTypeFilter = 'ALL';
  protected assetAvailabilityFilter = 'AVAILABLE';
  private loadedWorkOrderId: string | null = null;
  private titleTouched = false;

  constructor() {
    effect(() => {
      const workOrder = this.workOrder();
      if (!workOrder) {
        if (this.loadedWorkOrderId) {
          this.reset();
        }
        return;
      }
      if (this.loadedWorkOrderId === workOrder.id) {
        return;
      }
      this.loadWorkOrder(workOrder);
    });
    effect(() => {
      const workOrder = this.workOrder();
      const requestedStep = this.initialStep();
      const requestedResourceTab = this.initialResourceTab();
      if (workOrder) {
        this.step = this.clampStep(requestedStep);
        this.resourceTab = requestedResourceTab;
      }
    });
  }

  protected currentSteps(): string[] {
    return this.form.workOrderType === 'PICKUP_DELIVERY' ? this.pickupSteps : this.steps;
  }

  protected setStep(step: number): void {
    this.step = this.clampStep(step);
  }

  protected ownerOptions(): OwnerOption[] {
    const owners = new Map<string, string>();
    for (const property of this.properties()) {
      owners.set(property.ownerId, property.ownerName);
    }
    return [...owners].map(([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  }

  protected propertyOptions(): PropertyRecord[] {
    return this.ownerId ? this.properties().filter((property) => property.ownerId === this.ownerId) : this.properties();
  }

  protected selectedProperty(): PropertyRecord | undefined {
    return this.properties().find((property) => property.id === this.form.propertyId);
  }

  protected serviceOptions(): ServiceType[] {
    const property = this.selectedProperty();
    if (!property || property.services.length === 0) {
      return this.serviceTypes();
    }
    const assignedIds = new Set(property.services.map((service) => service.serviceTypeId));
    return this.serviceTypes().filter((service) => assignedIds.has(service.id));
  }

  protected eligibleWorkers(): WorkerRecord[] {
    const serviceTypeId = this.form.serviceTypeId;
    if (!serviceTypeId) {
      return this.workers();
    }
    return this.workers().filter((worker) => worker.serviceSkills.some((skill) => skill.serviceTypeId === serviceTypeId));
  }

  protected filteredWorkers(): WorkerRecord[] {
    const query = normalized(this.workerSearch);
    return this.eligibleWorkers().filter((worker) => {
      const availability = this.workerAvailability(worker);
      const matchesSearch = !query || normalized([
        worker.displayName,
        worker.employeeNumber,
        worker.phone,
        worker.email,
        worker.engagementType,
        ...worker.serviceSkills.map((skill) => skill.serviceName)
      ].filter(Boolean).join(' ')).includes(query);
      const matchesEngagement = this.workerEngagementFilter === 'ALL' || worker.engagementType === this.workerEngagementFilter;
      const matchesAvailability = this.workerAvailabilityFilter === 'ALL'
        || (this.workerAvailabilityFilter === 'AVAILABLE' && availability.available)
        || (this.workerAvailabilityFilter === 'UNAVAILABLE' && !availability.available);
      return matchesSearch && matchesEngagement && matchesAvailability;
    }).sort((left, right) => {
      const selectedCompare = Number(this.selectedWorkerIds.has(right.id)) - Number(this.selectedWorkerIds.has(left.id));
      if (selectedCompare !== 0) {
        return selectedCompare;
      }
      const availableCompare = Number(this.workerAvailability(right).available) - Number(this.workerAvailability(left).available);
      return availableCompare !== 0 ? availableCompare : left.displayName.localeCompare(right.displayName);
    });
  }

  protected filteredInventoryItems(): InventoryItem[] {
    const query = normalized(this.inventorySearch);
    return this.inventoryItems().filter((item) => {
      const matchesSearch = !query || normalized([item.name, item.categoryName, item.unit].filter(Boolean).join(' ')).includes(query);
      const matchesStock = this.inventoryStockFilter === 'ALL'
        || (this.inventoryStockFilter === 'AVAILABLE' && item.quantityOnHand > 0)
        || (this.inventoryStockFilter === 'LOW' && this.isLowStock(item));
      return matchesSearch && matchesStock;
    });
  }

  protected inventoryOptions(material: MaterialRow): InventoryItem[] {
    const options = this.filteredInventoryItems();
    if (!material.inventoryItemId || options.some((item) => item.id === material.inventoryItemId)) {
      return options;
    }
    const selected = this.inventoryItems().find((item) => item.id === material.inventoryItemId);
    return selected ? [selected, ...options] : options;
  }

  protected assetTypes(): string[] {
    return [...new Set(this.assets().map((asset) => asset.assetType))].sort((left, right) => left.localeCompare(right));
  }

  protected filteredAssets(): TenantAsset[] {
    const query = normalized(this.assetSearch);
    return this.assets().filter((asset) => {
      const matchesSearch = !query || normalized([asset.name, asset.assetType, asset.identifier, asset.storageLocation, asset.quantityOnHand.toString(), asset.assignedWorkerName].filter(Boolean).join(' ')).includes(query);
      const matchesType = this.assetTypeFilter === 'ALL' || asset.assetType === this.assetTypeFilter;
      const matchesAvailability = this.assetAvailabilityFilter === 'ALL'
        || (this.assetAvailabilityFilter === 'AVAILABLE' && (!asset.assignedWorkerId || this.selectedWorkerIds.has(asset.assignedWorkerId) || this.selectedAssetIds.has(asset.id)))
        || (this.assetAvailabilityFilter === 'UNASSIGNED' && !asset.assignedWorkerId)
        || (this.assetAvailabilityFilter === 'SELECTED' && this.selectedAssetIds.has(asset.id));
      return matchesSearch && matchesType && matchesAvailability;
    });
  }

  submit(): void {
    this.formError = '';
    if (this.saving() || this.isLockedWorkOrder()) {
      return;
    }
    const isPickupDelivery = this.form.workOrderType === 'PICKUP_DELIVERY';
    if (!this.ownerId) {
      this.step = 0;
      this.formError = 'Owner is required.';
      return;
    }
    if (!this.form.propertyId) {
      this.step = 0;
      this.formError = 'Property is required.';
      return;
    }
    if (!this.form.title.trim()) {
      this.step = 0;
      this.formError = 'Work order title is required.';
      return;
    }
    if (isPickupDelivery && this.routeStopRows.filter((stop) => stop.name.trim()).length === 0) {
      this.step = 1;
      this.formError = 'Add at least one pickup, delivery, supplier, warehouse, or return stop.';
      return;
    }
    const availabilityWarnings = this.selectedAvailabilityWarnings();
    if (!this.allowAvailabilityOverride && availabilityWarnings.length > 0) {
      const confirmed = window.confirm(`Selected worker schedule warning:\n\n${availabilityWarnings.join('\n')}\n\nSave anyway with dispatch override?`);
      if (!confirmed) {
        return;
      }
      this.allowAvailabilityOverride = true;
      this.formError = 'Dispatch override reason is required.';
      this.step = 2;
      return;
    }
    if (this.allowAvailabilityOverride && !this.availabilityOverrideReason.trim()) {
      this.step = 2;
      this.formError = 'Dispatch override reason is required.';
      return;
    }
    const duplicateLinks = this.duplicateLinkLabels();
    if (duplicateLinks.length) {
      this.step = 1;
      this.formError = `Remove duplicate linked work order relationship: ${duplicateLinks[0]}.`;
      return;
    }
    const workerIds = [...this.selectedWorkerIds];
    this.createWorkOrder.emit({
      ...this.form,
      workOrderType: this.form.workOrderType || 'SERVICE',
      serviceTypeId: this.form.serviceTypeId || undefined,
      assignedWorkerId: workerIds[0] || undefined,
      assignedWorkerIds: workerIds,
      leadWorkerId: this.leadWorkerId || workerIds[0] || undefined,
      title: this.form.title.trim(),
      description: this.form.description?.trim() || undefined,
      requesterName: this.form.requesterName?.trim() || undefined,
      requesterEmail: this.form.requesterEmail?.trim() || undefined,
      requesterPhone: this.form.requesterPhone?.trim() || undefined,
      recurrenceRule: !isPickupDelivery && this.form.recurrenceRule ? this.form.recurrenceRule : undefined,
      recurrenceInterval: !isPickupDelivery && this.form.recurrenceRule ? this.form.recurrenceInterval || 1 : undefined,
      recurrenceUntil: !isPickupDelivery && this.form.recurrenceRule ? this.form.recurrenceUntil || undefined : undefined,
      allowAvailabilityOverride: this.allowAvailabilityOverride || undefined,
      allowAvailabilityOverrideReason: this.allowAvailabilityOverride ? this.availabilityOverrideReason.trim() : undefined,
      scheduledStart: this.scheduledStart ? new Date(this.scheduledStart).toISOString() : undefined,
      scheduledEnd: this.scheduledEnd ? new Date(this.scheduledEnd).toISOString() : undefined,
      materials: this.materialRows
        .filter((material) => material.inventoryItemId || material.description.trim())
        .map((material) => ({
          id: material.existingId || undefined,
          inventoryItemId: material.inventoryItemId || undefined,
          description: material.description.trim() || undefined,
          quantity: Number(material.quantity) || 1,
          unitCost: material.unitCost === undefined || material.unitCost === null ? undefined : Number(material.unitCost)
        })),
      assetIds: [...this.selectedAssetIds],
      tasks: [],
      taskItems: this.taskRows
        .filter(() => !isPickupDelivery)
        .filter((task) => task.label.trim())
        .map((task) => ({
          id: task.existingId || undefined,
          label: task.label.trim(),
          assignedWorkerId: task.assignedWorkerId || undefined,
          phase: task.phase,
          required: task.required,
          notes: task.notes?.trim() || undefined
        })),
      routeStops: this.routeStopRows
        .filter((stop) => stop.name.trim())
        .map((stop) => ({
          id: stop.existingId || undefined,
          stopType: stop.stopType,
          name: stop.name.trim(),
          address: stop.address.trim() || undefined,
          instructions: stop.instructions.trim() || undefined,
          plannedArrival: stop.plannedArrival ? new Date(stop.plannedArrival).toISOString() : undefined
        })),
      linkedWorkOrders: this.linkRows
        .filter((link) => link.linkedWorkOrderId)
        .map((link) => ({
          linkedWorkOrderId: link.linkedWorkOrderId,
          linkType: link.linkType,
          notes: link.notes.trim() || undefined
        }))
    });
  }

  reset(workOrderType: WorkOrderType = this.initialWorkOrderType()): void {
    this.loadedWorkOrderId = null;
    this.formError = '';
    this.titleTouched = false;
    this.step = 0;
    this.ownerId = '';
    this.form = this.blankForm(workOrderType);
    this.scheduledStart = '';
    this.scheduledEnd = '';
    this.selectedWorkerIds.clear();
    this.selectedAssetIds.clear();
    this.leadWorkerId = '';
    this.materialRows = [];
    this.taskRows = defaultCompletionTasks();
    this.routeStopRows = [];
    this.linkRows = [];
    this.pickupForWorkOrderId = '';
    this.resourceTab = 'INVENTORY';
    this.workerSearch = '';
    this.workerEngagementFilter = 'ALL';
    this.workerAvailabilityFilter = 'AVAILABLE';
    this.allowAvailabilityOverride = false;
    this.availabilityOverrideReason = '';
    this.inventorySearch = '';
    this.inventoryStockFilter = 'AVAILABLE';
    this.assetSearch = '';
    this.assetTypeFilter = 'ALL';
    this.assetAvailabilityFilter = 'AVAILABLE';
    this.syncTypeDefaults();
  }

  protected onOwnerChange(): void {
    this.form.propertyId = '';
    this.form.serviceTypeId = '';
    this.syncSuggestedTitle();
    this.pruneWorkers();
  }

  protected onPropertyChange(): void {
    const property = this.selectedProperty();
    this.ownerId = property?.ownerId || this.ownerId;
    this.form.serviceTypeId = '';
    this.syncSuggestedTitle();
    this.pruneWorkers();
  }

  protected onServiceChange(): void {
    this.syncSuggestedTitle();
    this.pruneWorkers();
  }

  protected onWorkOrderTypeChange(): void {
    this.syncTypeDefaults();
    this.syncSuggestedTitle();
    this.setStep(this.step);
  }

  protected onTitleChange(value: string): void {
    this.titleTouched = true;
    this.form.title = value;
  }

  private syncSuggestedTitle(): void {
    if (this.titleTouched && this.form.title.trim()) {
      return;
    }
    const property = this.selectedProperty();
    if (!property) {
      this.form.title = '';
      return;
    }
    const service = this.serviceTypes().find((candidate) => candidate.id === this.form.serviceTypeId);
    if (this.form.workOrderType === 'PICKUP_DELIVERY') {
      const linked = this.workOrders().find((workOrder) => workOrder.id === this.pickupForWorkOrderId);
      this.form.title = linked ? `Pickup for ${linked.workOrderNumber}` : `Pickup / delivery - ${property.name}`;
      return;
    }
    if (this.form.workOrderType === 'INSPECTION') {
      this.form.title = `Inspection - ${property.name}`;
      return;
    }
    if (this.form.workOrderType === 'FOLLOW_UP') {
      this.form.title = `Follow-up - ${property.name}`;
      return;
    }
    this.form.title = `${service?.name || 'General service'} - ${property.name}`;
  }

  protected toggleWorker(workerId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) {
      this.selectedWorkerIds.add(workerId);
      this.leadWorkerId ||= workerId;
      return;
    }
    this.selectedWorkerIds.delete(workerId);
    if (this.leadWorkerId === workerId) {
      this.leadWorkerId = [...this.selectedWorkerIds][0] || '';
    }
  }

  protected toggleAsset(assetId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    if (checked) {
      this.selectedAssetIds.add(assetId);
      return;
    }
    this.selectedAssetIds.delete(assetId);
  }

  protected pruneWorkers(): void {
    const eligibleIds = new Set(this.eligibleWorkers().map((worker) => worker.id));
    [...this.selectedWorkerIds].forEach((workerId) => {
      if (!eligibleIds.has(workerId)) {
        this.selectedWorkerIds.delete(workerId);
      }
    });
    if (this.leadWorkerId && !this.selectedWorkerIds.has(this.leadWorkerId)) {
      this.leadWorkerId = [...this.selectedWorkerIds][0] || '';
    }
    this.taskRows = this.taskRows.map((task) => ({
      ...task,
      assignedWorkerId: task.assignedWorkerId && this.selectedWorkerIds.has(task.assignedWorkerId) ? task.assignedWorkerId : ''
    }));
  }

  protected selectedWorkers(): WorkerRecord[] {
    return this.workers()
      .filter((worker) => this.selectedWorkerIds.has(worker.id))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  protected isLockedWorkOrder(): boolean {
    const status = this.workOrder()?.status;
    return status === 'PENDING_COMPLETION' || status === 'COMPLETED' || status === 'APPROVED' || status === 'CUSTOMER_NOTIFIED' || status === 'INVOICED' || status === 'PAID';
  }

  protected lockedWorkOrderMessage(): string {
    const status = this.workOrder()?.status;
    if (status === 'PENDING_COMPLETION') {
      return 'This work order was submitted by the worker and is locked for review. Use approval, adjustment, invoice, or reassignment workflows instead.';
    }
    return 'This work order is locked because it is completed. Use review, adjustment, invoice, or payment workflows instead.';
  }

  protected addMaterial(): void {
    this.materialRows = [...this.materialRows, this.blankMaterial()];
  }

  protected removeMaterial(index: number): void {
    this.materialRows = this.materialRows.filter((_, candidateIndex) => candidateIndex !== index);
  }

  protected tasksByPhase(phase: ChecklistPhase): TaskRow[] {
    return this.taskRows.filter((task) => task.phase === phase);
  }

  protected addTask(phase: ChecklistPhase): void {
    this.taskRows = [...this.taskRows, this.blankTask(phase)];
  }

  protected removeTask(taskId: string): void {
    this.taskRows = this.taskRows.filter((task) => task.id !== taskId);
  }

  protected addRouteStop(): void {
    this.routeStopRows = [...this.routeStopRows, this.blankRouteStop()];
  }

  protected addPickupStop(): void {
    this.routeStopRows = [...this.routeStopRows, {
      ...this.blankRouteStop(),
      stopType: 'PICKUP',
      name: 'Pickup location'
    }];
  }

  protected removeRouteStop(routeStopId: string): void {
    this.routeStopRows = this.routeStopRows.filter((stop) => stop.id !== routeStopId);
  }

  protected addWorkOrderLink(): void {
    this.linkRows = [...this.linkRows, this.blankLink()];
  }

  protected removeWorkOrderLink(linkId: string): void {
    this.linkRows = this.linkRows.filter((link) => link.id !== linkId);
    if (!this.linkRows.some((link) => link.linkedWorkOrderId === this.pickupForWorkOrderId && link.linkType === 'PICKUP_FOR')) {
      this.pickupForWorkOrderId = '';
    }
  }

  protected syncPickupLink(): void {
    this.linkRows = this.linkRows.filter((link) => link.linkType !== 'PICKUP_FOR');
    if (!this.pickupForWorkOrderId) {
      this.syncSuggestedTitle();
      return;
    }
    this.form.workOrderType = 'PICKUP_DELIVERY';
    this.linkRows = [...this.linkRows, {
      id: crypto.randomUUID(),
      linkedWorkOrderId: this.pickupForWorkOrderId,
      linkType: 'PICKUP_FOR',
      notes: 'Pickup or delivery work required before linked service work order.'
    }];
    const linked = this.workOrders().find((workOrder) => workOrder.id === this.pickupForWorkOrderId);
    if (linked && (!this.ownerId || !this.form.propertyId)) {
      this.ownerId = linked.ownerId;
      this.form.propertyId = linked.propertyId;
      this.form.serviceTypeId = linked.serviceTypeId || '';
    }
    this.syncTypeDefaults();
    this.syncSuggestedTitle();
  }

  protected linkableWorkOrders(): WorkOrderRecord[] {
    const currentId = this.workOrder()?.id;
    return this.workOrders()
      .filter((workOrder) => workOrder.id !== currentId)
      .sort((left, right) => (right.scheduledStart || '').localeCompare(left.scheduledStart || ''));
  }

  protected linkLabel(workOrder: WorkOrderRecord): string {
    return `${workOrder.workOrderNumber} · ${workOrder.title} · ${workOrder.propertyName}`;
  }

  protected linkedCandidateMeta(link: LinkRow): string {
    const workOrder = this.workOrders().find((candidate) => candidate.id === link.linkedWorkOrderId);
    if (!workOrder) {
      return '';
    }
    const schedule = workOrder.scheduledStart ? toShortDateTime(workOrder.scheduledStart) : 'unscheduled';
    return `${workOrder.status.toLowerCase().replaceAll('_', ' ')} · ${schedule} · ${workOrder.ownerName}`;
  }

  protected linkTypeTitle(linkType: WorkOrderLinkType): string {
    return linkTypeOption(linkType).title;
  }

  protected linkTypeRule(linkType: WorkOrderLinkType): string {
    return linkTypeOption(linkType).rule;
  }

  protected workOrderTypeLabel(type: WorkOrderType | undefined): string {
    switch (type) {
      case 'PICKUP_DELIVERY':
        return 'Pickup / delivery work order';
      case 'INSPECTION':
        return 'Inspection work order';
      case 'FOLLOW_UP':
        return 'Follow-up work order';
      default:
        return 'Service work order';
    }
  }

  protected workOrderTypeHelp(type: WorkOrderType | undefined): string {
    switch (type) {
      case 'PICKUP_DELIVERY':
        return 'Create a worker job to pick up or deliver tools, keys, parts, chemicals, or purchased materials.';
      case 'INSPECTION':
        return 'Use for site checks, estimates, condition review, and non-repair visits.';
      case 'FOLLOW_UP':
        return 'Use for return visits connected to previous service work.';
      default:
        return 'Use for normal property maintenance work performed at the service address.';
    }
  }

  protected syncMaterialDescription(material: MaterialRow): void {
    if (material.description.trim()) {
      return;
    }
    const item = this.inventoryItems().find((candidate) => candidate.id === material.inventoryItemId);
    material.description = item?.name || '';
  }

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected workerAvailability(worker: WorkerRecord): WorkerAvailability {
    if (!this.scheduledStart || !this.scheduledEnd) {
      return { available: true, label: 'Schedule open' };
    }
    if (!coversShift(worker, this.scheduledStart, this.scheduledEnd)) {
      return { available: this.allowAvailabilityOverride, label: this.allowAvailabilityOverride ? 'Override: outside shift' : 'Outside shift' };
    }
    if (this.hasScheduleConflict(worker.id)) {
      return { available: this.allowAvailabilityOverride, label: this.allowAvailabilityOverride ? 'Override: conflict' : 'Conflict' };
    }
    return { available: true, label: 'Available' };
  }

  private selectedAvailabilityWarnings(): string[] {
    if (!this.scheduledStart || !this.scheduledEnd) {
      return [];
    }
    return [...this.selectedWorkerIds]
      .map((workerId) => this.workers().find((worker) => worker.id === workerId))
      .filter((worker): worker is WorkerRecord => Boolean(worker))
      .map((worker) => {
        if (!coversShift(worker, this.scheduledStart, this.scheduledEnd)) {
          return `${worker.displayName}: outside shift`;
        }
        if (this.hasScheduleConflict(worker.id)) {
          return `${worker.displayName}: overlapping work order`;
        }
        return '';
      })
      .filter(Boolean);
  }

  protected isLowStock(item: InventoryItem): boolean {
    return item.reorderLevel !== undefined && item.quantityOnHand <= item.reorderLevel;
  }

  private loadWorkOrder(workOrder: WorkOrderRecord): void {
    this.loadedWorkOrderId = workOrder.id;
    this.formError = '';
    this.titleTouched = true;
    this.step = this.clampStep(this.initialStep());
    this.resourceTab = this.initialResourceTab();
    this.ownerId = workOrder.ownerId;
    this.form = {
      propertyId: workOrder.propertyId,
      serviceTypeId: workOrder.serviceTypeId || '',
      workOrderType: workOrder.workOrderType || 'SERVICE',
      title: workOrder.title,
      description: workOrder.description || '',
      source: workOrder.source,
      status: workOrder.status,
      priority: workOrder.priority,
      requesterName: workOrder.requesterName || '',
      requesterEmail: workOrder.requesterEmail || '',
      requesterPhone: workOrder.requesterPhone || '',
      recurrenceRule: workOrder.recurrenceRule || '',
      recurrenceInterval: workOrder.recurrenceInterval || 1,
      recurrenceUntil: workOrder.recurrenceUntil || '',
      tasks: [],
      taskItems: []
    };
    this.scheduledStart = toDateTimeInput(workOrder.scheduledStart);
    this.scheduledEnd = toDateTimeInput(workOrder.scheduledEnd);
    this.allowAvailabilityOverride = false;
    this.availabilityOverrideReason = '';
    this.selectedWorkerIds.clear();
    for (const assignment of workOrder.assignments.filter(isActiveAssignment)) {
      this.selectedWorkerIds.add(assignment.workerId);
      if (assignment.leadWorker) {
        this.leadWorkerId = assignment.workerId;
      }
    }
    this.leadWorkerId ||= [...this.selectedWorkerIds][0] || '';
    this.selectedAssetIds.clear();
    for (const asset of workOrder.assets) {
      this.selectedAssetIds.add(asset.assetId);
    }
    this.materialRows = workOrder.materials.length
      ? workOrder.materials.map((material) => ({
          id: material.id,
          existingId: material.id,
          inventoryItemId: material.inventoryItemId || '',
          description: material.description || material.itemName || '',
          quantity: material.quantity,
          unitCost: material.unitCost
        }))
      : [];
    this.taskRows = workOrder.tasks.length
      ? workOrder.tasks.map((task) => ({
          id: task.id,
          existingId: task.id,
          label: task.label,
          assignedWorkerId: task.assignedWorkerId || '',
          phase: task.phase || 'COMPLETION',
          required: task.required,
          notes: task.notes || ''
        }))
      : [];
    this.routeStopRows = (workOrder.routeStops ?? []).map((stop) => ({
      id: stop.id,
      existingId: stop.id,
      stopType: stop.stopType,
      name: stop.name,
      address: stop.address || '',
      instructions: stop.instructions || '',
      plannedArrival: toDateTimeInput(stop.plannedArrival)
    }));
    this.linkRows = (workOrder.linkedWorkOrders ?? []).map((link) => ({
      id: `${link.linkedWorkOrderId}-${link.linkType}`,
      linkedWorkOrderId: link.linkedWorkOrderId,
      linkType: link.linkType,
      notes: link.notes || ''
    }));
    this.pickupForWorkOrderId = this.linkRows.find((link) => link.linkType === 'PICKUP_FOR')?.linkedWorkOrderId || '';
    this.syncTypeDefaults();
    this.setStep(this.step);
  }

  private hasScheduleConflict(workerId: string): boolean {
    if (!this.scheduledStart || !this.scheduledEnd) {
      return false;
    }
    const currentId = this.workOrder()?.id;
    const start = new Date(this.scheduledStart).getTime();
    const end = new Date(this.scheduledEnd).getTime();
    return this.workOrders().some((workOrder) => {
      if (workOrder.id === currentId || !workOrder.scheduledStart || !workOrder.scheduledEnd) {
        return false;
      }
      if (workOrder.status === 'CANCELLED' || workOrder.status === 'COMPLETED') {
        return false;
      }
      if (!workOrder.assignments.some((assignment) => assignment.workerId === workerId)) {
        return false;
      }
      return start < new Date(workOrder.scheduledEnd).getTime() && end > new Date(workOrder.scheduledStart).getTime();
    });
  }

  private syncTypeDefaults(): void {
    if (this.form.workOrderType !== 'PICKUP_DELIVERY') {
      return;
    }
    this.form.source = 'ADHOC_CALL';
    this.form.recurrenceRule = '';
    this.form.recurrenceInterval = 1;
    this.form.recurrenceUntil = '';
    this.form.serviceTypeId = '';
    if (this.routeStopRows.length === 0) {
      this.addPickupStop();
    }
    if (isCurrentDefaultTaskSet(this.taskRows)) {
      this.taskRows = [];
    }
  }

  private clampStep(step: number): number {
    return Math.max(0, Math.min(this.currentSteps().length - 1, Number.isFinite(step) ? step : 0));
  }

  private blankForm(workOrderType: WorkOrderType = this.initialWorkOrderType()): CreateWorkOrderRequest {
    return {
      propertyId: '',
      serviceTypeId: '',
      workOrderType,
      title: '',
      description: '',
      source: 'TENANT_PORTAL' as WorkOrderSource,
      status: 'DRAFT' as WorkOrderStatus,
      priority: 'NORMAL',
      recurrenceRule: '',
      recurrenceInterval: 1,
      tasks: [],
      taskItems: []
    };
  }

  private blankMaterial(): MaterialRow {
    return { id: crypto.randomUUID(), inventoryItemId: '', description: '', quantity: 1, unitCost: undefined };
  }

  private blankTask(phase: ChecklistPhase): TaskRow {
    return { id: crypto.randomUUID(), label: '', assignedWorkerId: '', phase, required: true, notes: '' };
  }

  private blankRouteStop(): RouteStopRow {
    return { id: crypto.randomUUID(), stopType: 'PICKUP', name: '', address: '', instructions: '', plannedArrival: '' };
  }

  private blankLink(): LinkRow {
    return { id: crypto.randomUUID(), linkedWorkOrderId: '', linkType: 'RELATED', notes: '' };
  }

  private duplicateLinkLabels(): string[] {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const link of this.linkRows.filter((candidate) => candidate.linkedWorkOrderId)) {
      const key = `${link.linkedWorkOrderId}:${link.linkType}`;
      const label = `${this.linkTypeTitle(link.linkType)} - ${this.workOrders().find((workOrder) => workOrder.id === link.linkedWorkOrderId)?.workOrderNumber || 'selected work order'}`;
      if (seen.has(key)) {
        duplicates.push(label);
        continue;
      }
      seen.set(key, label);
    }
    return duplicates;
  }
}

const LINK_TYPE_OPTIONS: LinkTypeOption[] = [
  {
    value: 'PICKUP_FOR',
    label: 'Pickup before',
    shortHelp: 'pickup must finish first',
    title: 'Pickup or delivery before linked work',
    rule: 'Use when this job collects keys, tools, parts, chemicals, or purchases needed before the selected service job can finish.'
  },
  {
    value: 'FOLLOWS',
    label: 'Follow after',
    shortHelp: 'this waits for selected job',
    title: 'This work happens after the selected work',
    rule: 'Use for follow-up visits, second-stage work, or return work that should not be completed until the selected work is complete.'
  },
  {
    value: 'BLOCKS',
    label: 'Blocks',
    shortHelp: 'selected job waits',
    title: 'This work blocks the selected work',
    rule: 'Use when the selected work order cannot move forward until this work order is complete enough for operations review.'
  },
  {
    value: 'SAME_RECURRENCE',
    label: 'Same series',
    shortHelp: 'same recurring pattern',
    title: 'Same recurring work series',
    rule: 'Use to group generated recurring drafts or repeated visits for the same property and service pattern.'
  },
  {
    value: 'RELATED',
    label: 'Related',
    shortHelp: 'reference only',
    title: 'Reference-only relationship',
    rule: 'Use when operations should see the connection, but neither work order should block or wait for the other.'
  }
];

const DEFAULT_PRE_START_CHECKS = [
  'Confirm correct property and service scope',
  'Review dispatch instructions',
  'Confirm required tools and equipment are available',
  'Capture before photo if needed'
];

const DEFAULT_COMPLETION_CHECKS = [
  'Confirm work area is safe and clean',
  'Capture required after photo',
  'Record materials used or purchases',
  'Return assigned tools and equipment',
  'Add final field note'
];

function defaultCompletionTasks(): TaskRow[] {
  return [
    ...defaultTasksForPhase('PRE_START', DEFAULT_PRE_START_CHECKS),
    ...defaultTasksForPhase('COMPLETION', DEFAULT_COMPLETION_CHECKS)
  ];
}

function isCurrentDefaultTaskSet(tasks: TaskRow[]): boolean {
  const labels = tasks.map((task) => task.label);
  const serviceDefaults = [...DEFAULT_PRE_START_CHECKS, ...DEFAULT_COMPLETION_CHECKS];
  return sameLabels(labels, serviceDefaults);
}

function sameLabels(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((label, index) => label === right[index]);
}

function defaultTasksForPhase(phase: ChecklistPhase, labels: string[]): TaskRow[] {
  return labels.map((label) => ({
    id: crypto.randomUUID(),
    label,
    assignedWorkerId: '',
    phase,
    required: true,
    notes: ''
  }));
}

function toDateTimeInput(value?: string): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toShortDateTime(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function linkTypeOption(linkType: WorkOrderLinkType): LinkTypeOption {
  return LINK_TYPE_OPTIONS.find((option) => option.value === linkType) || LINK_TYPE_OPTIONS[LINK_TYPE_OPTIONS.length - 1];
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

interface OwnerOption {
  id: string;
  name: string;
}

interface WorkerAvailability {
  available: boolean;
  label: string;
}

interface MaterialRow {
  id: string;
  existingId?: string;
  inventoryItemId: string;
  description: string;
  quantity: number;
  unitCost?: number;
}

interface TaskRow {
  id: string;
  existingId?: string;
  label: string;
  assignedWorkerId: string;
  phase: ChecklistPhase;
  required: boolean;
  notes?: string;
}

interface RouteStopRow {
  id: string;
  existingId?: string;
  stopType: RouteStopType;
  name: string;
  address: string;
  instructions: string;
  plannedArrival: string;
}

interface LinkRow {
  id: string;
  linkedWorkOrderId: string;
  linkType: WorkOrderLinkType;
  notes: string;
}

interface LinkTypeOption {
  value: WorkOrderLinkType;
  label: string;
  shortHelp: string;
  title: string;
  rule: string;
}

function isActiveAssignment(assignment: { assignmentStatus?: string }): boolean {
  return !['DECLINED', 'RELEASED', 'LEFT_EMERGENCY', 'COMPLETED'].includes(assignment.assignmentStatus || '');
}
