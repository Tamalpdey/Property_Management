import { ChangeDetectionStrategy, Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import {
  CreateWorkOrderRequest,
  InventoryItem,
  PropertyRecord,
  ServiceType,
  TenantAsset,
  WorkOrderRecord,
  WorkOrderSource,
  WorkOrderStatus,
  WorkerRecord
} from '@lorne/contracts';

type ChecklistPhase = 'PRE_START' | 'COMPLETION';
type ResourceTab = 'INVENTORY' | 'TOOLS';

@Component({
  selector: 'lorne-work-order-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-3" (ngSubmit)="submit()">
      <div>
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

      <fieldset class="space-y-3" [disabled]="isLockedWorkOrder()">
      <div class="grid grid-cols-5 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        @for (stepLabel of steps; track stepLabel; let index = $index) {
          <button
            pButton
            type="button"
            size="small"
            [severity]="step === index ? 'primary' : 'secondary'"
            [text]="step !== index"
            [label]="stepLabel"
            (click)="step = index"
          ></button>
        }
      </div>

      @if (step === 0) {
        <div class="grid gap-2">
          <div class="grid gap-2 md:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Owner</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="ownerId" required [(ngModel)]="ownerId" (ngModelChange)="onOwnerChange()">
                <option value="">Select owner</option>
                @for (owner of ownerOptions(); track owner.id) {
                  <option [value]="owner.id">{{ owner.name }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Property</span>
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

          <div class="grid gap-2 md:grid-cols-3">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Source</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="source" [(ngModel)]="form.source">
                <option value="TENANT_PORTAL">Tenant portal</option>
                <option value="ADHOC_CALL">Adhoc call</option>
                <option value="WEBSITE">Website</option>
                <option value="CUSTOMER_PORTAL">Customer portal</option>
                <option value="RECURRING">Recurring</option>
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
              <select class="w-full border border-slate-300 px-3 py-2" name="serviceTypeId" [(ngModel)]="form.serviceTypeId" (ngModelChange)="pruneWorkers()">
                <option value="">General service</option>
                @for (service of serviceOptions(); track service.id) {
                  <option [value]="service.id">{{ service.name }}{{ service.categoryName ? ' · ' + service.categoryName : '' }}</option>
                }
              </select>
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Work order title</span>
            <input pInputText class="w-full" name="title" required [(ngModel)]="form.title" />
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

          <div class="grid gap-2 md:grid-cols-3">
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
          </div>
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

          <div class="max-h-72 space-y-2 overflow-y-auto pr-1">
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

      <div class="flex justify-between gap-2 border-t border-slate-200 pt-3">
        <button pButton type="button" severity="secondary" icon="pi pi-arrow-left" label="Back" [disabled]="step === 0" (click)="step = step - 1"></button>
        <div class="flex gap-2">
          @if (step < steps.length - 1) {
            <button pButton type="button" severity="secondary" icon="pi pi-arrow-right" iconPos="right" label="Next" (click)="step = step + 1"></button>
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
  readonly saving = input(false);
  readonly saveError = input('');
  readonly createWorkOrder = output<CreateWorkOrderRequest>();

  protected readonly steps = ['Context', 'Schedule', 'Workers', 'Checklist', 'Resources'];
  protected step = 0;
  protected resourceTab: ResourceTab = 'INVENTORY';
  protected ownerId = '';
  protected form: CreateWorkOrderRequest = this.blankForm();
  protected scheduledStart = '';
  protected scheduledEnd = '';
  protected readonly selectedWorkerIds = new Set<string>();
  protected readonly selectedAssetIds = new Set<string>();
  protected leadWorkerId = '';
  protected materialRows: MaterialRow[] = [];
  protected taskRows: TaskRow[] = defaultCompletionTasks();
  protected workerSearch = '';
  protected workerEngagementFilter = 'ALL';
  protected workerAvailabilityFilter = 'AVAILABLE';
  protected inventorySearch = '';
  protected inventoryStockFilter = 'AVAILABLE';
  protected assetSearch = '';
  protected assetTypeFilter = 'ALL';
  protected assetAvailabilityFilter = 'AVAILABLE';
  private loadedWorkOrderId: string | null = null;

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
        this.step = clampStep(requestedStep);
        this.resourceTab = requestedResourceTab;
      }
    });
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
    if (!this.form.propertyId || !this.form.title.trim() || this.saving() || this.isLockedWorkOrder()) {
      return;
    }
    const workerIds = [...this.selectedWorkerIds];
    this.createWorkOrder.emit({
      ...this.form,
      serviceTypeId: this.form.serviceTypeId || undefined,
      assignedWorkerId: workerIds[0] || undefined,
      assignedWorkerIds: workerIds,
      leadWorkerId: this.leadWorkerId || workerIds[0] || undefined,
      title: this.form.title.trim(),
      description: this.form.description?.trim() || undefined,
      requesterName: this.form.requesterName?.trim() || undefined,
      requesterEmail: this.form.requesterEmail?.trim() || undefined,
      requesterPhone: this.form.requesterPhone?.trim() || undefined,
      recurrenceRule: this.form.recurrenceRule || undefined,
      recurrenceInterval: this.form.recurrenceRule ? this.form.recurrenceInterval || 1 : undefined,
      recurrenceUntil: this.form.recurrenceRule ? this.form.recurrenceUntil || undefined : undefined,
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
        .filter((task) => task.label.trim())
        .map((task) => ({
          id: task.existingId || undefined,
          label: task.label.trim(),
          assignedWorkerId: task.assignedWorkerId || undefined,
          phase: task.phase,
          required: task.required,
          notes: task.notes?.trim() || undefined
        }))
    });
  }

  reset(): void {
    this.loadedWorkOrderId = null;
    this.step = 0;
    this.ownerId = '';
    this.form = this.blankForm();
    this.scheduledStart = '';
    this.scheduledEnd = '';
    this.selectedWorkerIds.clear();
    this.selectedAssetIds.clear();
    this.leadWorkerId = '';
    this.materialRows = [];
    this.taskRows = defaultCompletionTasks();
    this.resourceTab = 'INVENTORY';
    this.workerSearch = '';
    this.workerEngagementFilter = 'ALL';
    this.workerAvailabilityFilter = 'AVAILABLE';
    this.inventorySearch = '';
    this.inventoryStockFilter = 'AVAILABLE';
    this.assetSearch = '';
    this.assetTypeFilter = 'ALL';
    this.assetAvailabilityFilter = 'AVAILABLE';
  }

  protected onOwnerChange(): void {
    this.form.propertyId = '';
    this.form.serviceTypeId = '';
    this.pruneWorkers();
  }

  protected onPropertyChange(): void {
    const property = this.selectedProperty();
    this.ownerId = property?.ownerId || this.ownerId;
    this.form.serviceTypeId = '';
    this.pruneWorkers();
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
      return { available: false, label: 'Outside shift' };
    }
    if (this.hasScheduleConflict(worker.id)) {
      return { available: false, label: 'Conflict' };
    }
    return { available: true, label: 'Available' };
  }

  protected isLowStock(item: InventoryItem): boolean {
    return item.reorderLevel !== undefined && item.quantityOnHand <= item.reorderLevel;
  }

  private loadWorkOrder(workOrder: WorkOrderRecord): void {
    this.loadedWorkOrderId = workOrder.id;
    this.step = clampStep(this.initialStep());
    this.resourceTab = this.initialResourceTab();
    this.ownerId = workOrder.ownerId;
    this.form = {
      propertyId: workOrder.propertyId,
      serviceTypeId: workOrder.serviceTypeId || '',
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

  private blankForm(): CreateWorkOrderRequest {
    return {
      propertyId: '',
      serviceTypeId: '',
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
}

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

function clampStep(step: number): number {
  return Math.max(0, Math.min(4, Number.isFinite(step) ? step : 0));
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

function isActiveAssignment(assignment: { assignmentStatus?: string }): boolean {
  return !['DECLINED', 'RELEASED', 'LEFT_EMERGENCY', 'COMPLETED'].includes(assignment.assignmentStatus || '');
}
