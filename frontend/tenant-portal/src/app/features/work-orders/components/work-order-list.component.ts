import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WorkOrderRecord, WorkOrderStatus } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

export type WorkOrderFormResourceTab = 'INVENTORY' | 'TOOLS';

export interface WorkOrderEditRequest {
  workOrder: WorkOrderRecord;
  step: number;
  resourceTab?: WorkOrderFormResourceTab;
}

export type WorkOrderReviewTarget = 'SUMMARY' | 'WORKERS' | 'EVIDENCE' | 'RESOURCES' | 'INVOICE' | 'COMMUNICATION' | 'TIME' | 'AUDIT';

export interface WorkOrderReviewRequest {
  workOrder: WorkOrderRecord;
  target: WorkOrderReviewTarget;
}

export type WorkOrderStatusFilter = WorkOrderStatus | 'ALL' | 'OPEN' | 'REVIEW' | 'BILLING';
export type WorkOrderDateFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'THIS_WEEK' | 'NEXT_7' | 'OVERDUE' | 'UNSCHEDULED' | 'PAST' | 'CUSTOM';

export interface WorkOrderListFilterChange {
  statusFilter: WorkOrderStatusFilter;
  dateFilter: WorkOrderDateFilter;
  customFrom?: string;
  customTo?: string;
}

@Component({
  selector: 'lorne-work-order-list',
  standalone: true,
  imports: [ButtonModule, DatePipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, FormsModule, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search by work order #, property, owner, service, worker, status..."
        [query]="collection.query()"
        [totalCount]="workOrders().length"
        [filteredCount]="collection.filtered().length"
        [selectedCount]="collection.selectedCount()"
        [sortKey]="collection.sortKey()"
        [sortOptions]="collection.sortOptions"
        (queryChange)="collection.setQuery($event)"
        (sortKeyChange)="collection.setSort($event)"
        (clearSelection)="collection.clearSelection()"
      />

      <div class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
        <div class="grid gap-1.5 lg:grid-cols-[auto_auto_auto_1fr] lg:items-center">
          <div class="flex min-w-0 flex-wrap items-center gap-1.5">
            <span class="text-xs font-black uppercase tracking-wide text-slate-500">Filters</span>
            <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{{ workOrders().length }} shown</span>
          </div>

          <select class="rounded-lg border border-slate-300 px-2 py-1 text-[0.9rem] font-semibold text-slate-700" [ngModel]="statusFilter()" (ngModelChange)="setStatusFilter($event)">
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open work</option>
            <option value="REVIEW">Pending review</option>
            <option value="BILLING">Billing ready</option>
            @for (status of statusOptions; track status) {
              <option [value]="status">{{ statusLabel(status) }}</option>
            }
          </select>

          <select class="rounded-lg border border-slate-300 px-2 py-1 text-[0.9rem] font-semibold text-slate-700" [ngModel]="dateFilter()" (ngModelChange)="setDateFilter($event)">
            <option value="ALL">All dates</option>
            <option value="TODAY">Today</option>
            <option value="TOMORROW">Tomorrow</option>
            <option value="THIS_WEEK">This week</option>
            <option value="NEXT_7">Next 7 days</option>
            <option value="OVERDUE">Overdue</option>
            <option value="UNSCHEDULED">Unscheduled</option>
            <option value="PAST">Past scheduled</option>
            <option value="CUSTOM">Custom range</option>
          </select>

          <div class="flex flex-wrap items-center justify-end gap-1.5">
            @if (dateFilter() === 'CUSTOM') {
              <input class="rounded-lg border border-slate-300 px-2 py-1 text-[0.9rem] font-semibold text-slate-700" type="date" [ngModel]="customFrom()" (ngModelChange)="setCustomFrom($event)" />
              <span class="text-xs font-bold text-slate-400">to</span>
              <input class="rounded-lg border border-slate-300 px-2 py-1 text-[0.9rem] font-semibold text-slate-700" type="date" [ngModel]="customTo()" (ngModelChange)="setCustomTo($event)" />
            }
            @if (collection.selectedCount() > 0) {
              <button pButton type="button" size="small" severity="info" icon="pi pi-users" label="Bulk assign" (click)="bulkAssign()"></button>
            }
            <button pButton type="button" size="small" severity="secondary" icon="pi pi-filter-slash" label="Clear" [disabled]="!hasFilters()" (click)="clearFilters()"></button>
          </div>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[86rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3">
                  <input type="checkbox" class="h-4 w-4" [checked]="collection.allPageSelected()" (change)="collection.togglePage()" />
                </th>
                <th class="px-3 py-3">Work order</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Source</th>
                <th class="px-3 py-3">Property</th>
                <th class="px-3 py-3">Service</th>
                <th class="px-3 py-3">Schedule</th>
                <th class="px-3 py-3">Workers</th>
                <th class="px-3 py-3">Resources</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (workOrder of collection.page(); track workOrder.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(workOrder)" (change)="collection.toggle(workOrder)" />
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-bold text-slate-950">{{ workOrder.title }}</p>
                      <p-tag [value]="workOrder.priority" [severity]="workOrder.priority === 'URGENT' || workOrder.priority === 'HIGH' ? 'warn' : 'secondary'" />
                    </div>
                    <p class="mt-1 text-xs font-bold text-teal-700">{{ workOrder.workOrderNumber }}</p>
                    <p class="mt-1 line-clamp-1 text-xs text-slate-500">{{ workOrder.description || 'No description' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    <p-tag [value]="statusLabel(workOrder.status)" [severity]="statusSeverity(workOrder.status)" />
                  </td>
                  <td class="px-3 py-3 text-slate-600">{{ sourceLabel(workOrder.source) }}</td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-teal-700">{{ workOrder.propertyName }}</p>
                    <p class="text-xs text-slate-500">{{ workOrder.ownerName }}</p>
                  </td>
                  <td class="px-3 py-3 text-slate-600">{{ workOrder.serviceName || 'General service' }}</td>
                  <td class="px-3 py-3 text-slate-600">
                    @if (workOrder.scheduledStart) {
                      <p class="font-semibold text-slate-800">{{ workOrder.scheduledStart | date:'MMM d, y, h:mm a' }}</p>
                      <p class="mt-0.5 text-xs font-semibold text-slate-500">
                        {{ workOrder.scheduledEnd ? ('to ' + (workOrder.scheduledEnd | date:'MMM d, y, h:mm a')) : 'End time open' }}
                      </p>
                    } @else {
                      <span class="text-xs font-bold text-amber-700">Unscheduled</span>
                    }
                  </td>
                  <td class="px-3 py-3">
                    <div class="grid max-w-xs gap-1">
                      @for (assignment of workOrder.assignments.slice(0, 2); track assignment.workerId) {
                        <span class="rounded-lg bg-slate-100 px-2 py-1">
                          <span class="block text-xs font-bold leading-4 text-slate-800">{{ assignment.workerName }}</span>
                          @if (assignment.workerEmail) {
                            <span class="block truncate text-[0.68rem] font-semibold leading-4 text-slate-500">{{ assignment.workerEmail }}</span>
                          }
                        </span>
                      } @empty {
                        <span class="text-xs font-semibold text-amber-700">Unassigned</span>
                      }
                      @if (workOrder.assignments.length > 2) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">+{{ workOrder.assignments.length - 2 }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex flex-wrap gap-1">
                      <p-tag [value]="workOrder.materials.length + ' materials'" severity="info" />
                      <p-tag [value]="workOrder.assets.length + ' tools'" severity="secondary" />
                    </div>
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openWorkOrderMenu(workOrder, $event, workOrderMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="10" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No work orders found.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #workOrderMenu [popup]="true" [model]="workOrderMenuItems()" appendTo="body" />
      <lorne-dense-collection-footer
        [filteredCount]="collection.filtered().length"
        [pageIndex]="collection.pageIndex()"
        [pageCount]="collection.pageCount()"
        [pageSize]="collection.pageSize()"
        (pageSizeChange)="collection.setPageSize($event)"
        (previousPage)="collection.previousPage()"
        (nextPage)="collection.nextPage()"
      />
    </div>
  `
})
export class WorkOrderListComponent {
  readonly workOrders = input.required<WorkOrderRecord[]>();
  readonly loading = input(false);
  readonly statusFilter = input<WorkOrderStatusFilter>('OPEN');
  readonly dateFilter = input<WorkOrderDateFilter>('ALL');
  readonly customFrom = input('');
  readonly customTo = input('');
  readonly editWorkOrder = output<WorkOrderEditRequest>();
  readonly reviewWorkOrder = output<WorkOrderReviewRequest>();
  readonly generateInvoiceWorkOrder = output<WorkOrderRecord>();
  readonly cancelWorkOrder = output<WorkOrderRecord>();
  readonly bulkAssignWorkOrders = output<WorkOrderRecord[]>();
  readonly filtersChanged = output<WorkOrderListFilterChange>();
  protected readonly selectedWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly workOrderMenuItems = signal<MenuItem[]>([]);
  protected readonly statusOptions: WorkOrderStatus[] = [
    'DRAFT',
    'TO_DO',
    'PENDING',
    'SCHEDULED',
    'ASSIGNED',
    'TRAVELING',
    'ON_SITE',
    'IN_PROGRESS',
    'PAUSED',
    'ON_HOLD',
    'PENDING_COMPLETION',
    'COMPLETED',
    'APPROVED',
    'CUSTOMER_NOTIFIED',
    'INVOICED',
    'PAID',
    'CANCELLED'
  ];
  protected readonly collection = new DenseCollectionState<WorkOrderRecord>(
    this.workOrders,
    (workOrder) => workOrder.id,
    (workOrder) => [
      workOrder.title,
      workOrder.workOrderNumber,
      workOrder.description,
      workOrder.ownerName,
      workOrder.propertyName,
      workOrder.propertyAddress,
      workOrder.serviceName,
      workOrder.status,
      workOrder.source,
      workOrder.priority,
      ...workOrder.assignments.map((assignment) => assignment.workerName),
      ...workOrder.assignments.map((assignment) => assignment.workerEmail),
      ...workOrder.materials.map((material) => material.description),
      ...workOrder.assets.map((asset) => asset.name)
    ].filter(Boolean).join(' '),
    [
      { label: 'Schedule soonest', value: 'schedule-asc', compare: (left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart) },
      { label: 'Schedule latest', value: 'schedule-desc', compare: (left, right) => dateValue(right.scheduledStart) - dateValue(left.scheduledStart) },
      { label: 'Priority', value: 'priority-desc', compare: (left, right) => priorityValue(right.priority) - priorityValue(left.priority) },
      { label: 'Status A-Z', value: 'status-asc', compare: (left, right) => left.status.localeCompare(right.status) },
      { label: 'Property A-Z', value: 'property-asc', compare: (left, right) => left.propertyName.localeCompare(right.propertyName) }
    ]
  );

  protected statusLabel(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected sourceLabel(source: string): string {
    return source.toLowerCase().replaceAll('_', ' ');
  }

  protected setStatusFilter(value: WorkOrderStatusFilter): void {
    this.emitFilters({ statusFilter: value });
  }

  protected setDateFilter(value: WorkOrderDateFilter): void {
    const clearCustom = value !== 'CUSTOM';
    this.emitFilters({ dateFilter: value, customFrom: clearCustom ? '' : this.customFrom(), customTo: clearCustom ? '' : this.customTo() });
  }

  protected setCustomFrom(value: string): void {
    this.emitFilters({ customFrom: value || undefined });
  }

  protected setCustomTo(value: string): void {
    this.emitFilters({ customTo: value || undefined });
  }

  protected clearFilters(): void {
    this.emitFilters({ statusFilter: 'ALL', dateFilter: 'ALL', customFrom: '', customTo: '' });
  }

  protected bulkAssign(): void {
    const selectedIds = this.collection.selectedIds();
    const selectedWorkOrders = this.workOrders().filter((workOrder) => selectedIds.has(workOrder.id) && !isReviewLocked(workOrder.status));
    this.bulkAssignWorkOrders.emit(selectedWorkOrders);
  }

  protected hasFilters(): boolean {
    return this.statusFilter() !== 'ALL' || this.dateFilter() !== 'ALL' || !!this.customFrom() || !!this.customTo();
  }

  protected openWorkOrderMenu(workOrder: WorkOrderRecord, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedWorkOrder.set(workOrder);
    const locked = isReviewLocked(workOrder.status);
    this.workOrderMenuItems.set([
      { label: workOrder.status === 'PENDING_COMPLETION' ? 'Review completion' : '360 view', icon: 'pi pi-search', command: () => this.review(workOrder, 'SUMMARY') },
      { label: 'Print view', icon: 'pi pi-print', command: () => this.review(workOrder, 'SUMMARY') },
      { label: 'Workers', icon: 'pi pi-users', command: () => this.review(workOrder, 'WORKERS') },
      { label: 'Evidence', icon: 'pi pi-camera', command: () => this.review(workOrder, 'EVIDENCE') },
      { label: 'Resources', icon: 'pi pi-box', command: () => this.review(workOrder, 'RESOURCES') },
      { label: 'Invoice', icon: 'pi pi-receipt', command: () => this.review(workOrder, 'INVOICE') },
      { label: 'Communication', icon: 'pi pi-envelope', command: () => this.review(workOrder, 'COMMUNICATION') },
      { label: 'Timeline', icon: 'pi pi-clock', command: () => this.review(workOrder, 'TIME') },
      { label: 'Audit log', icon: 'pi pi-history', command: () => this.review(workOrder, 'AUDIT') },
      { label: 'Generate invoice', icon: 'pi pi-file-edit', disabled: !canGenerateInvoice(workOrder.status), command: () => this.generateInvoice(workOrder) },
      { separator: true },
      { label: 'Update details', icon: 'pi pi-pencil', disabled: locked, command: () => this.edit(workOrder, 0) },
      { label: 'Schedule', icon: 'pi pi-calendar-clock', disabled: locked, command: () => this.edit(workOrder, 1) },
      { label: 'Assign workers', icon: 'pi pi-users', disabled: locked, command: () => this.edit(workOrder, 2) },
      { label: 'Checklist', icon: 'pi pi-list-check', disabled: locked, command: () => this.edit(workOrder, 3) },
      { label: 'Materials', icon: 'pi pi-box', disabled: locked, command: () => this.edit(workOrder, 4, 'INVENTORY') },
      { label: 'Tools & equipment', icon: 'pi pi-wrench', disabled: locked, command: () => this.edit(workOrder, 4, 'TOOLS') },
      { separator: true },
      { label: 'Cancel order', icon: 'pi pi-ban', disabled: !canCancel(workOrder.status), command: () => this.cancel(workOrder) }
    ]);
    menu.toggle(event);
  }

  protected edit(workOrder: WorkOrderRecord, step: number, resourceTab?: WorkOrderFormResourceTab): void {
    this.selectedWorkOrder.set(null);
    this.editWorkOrder.emit({ workOrder, step, resourceTab });
  }

  protected review(workOrder: WorkOrderRecord, target: WorkOrderReviewTarget): void {
    this.selectedWorkOrder.set(null);
    this.reviewWorkOrder.emit({ workOrder, target });
  }

  protected generateInvoice(workOrder: WorkOrderRecord): void {
    this.selectedWorkOrder.set(null);
    this.generateInvoiceWorkOrder.emit(workOrder);
  }

  protected cancel(workOrder: WorkOrderRecord): void {
    this.selectedWorkOrder.set(null);
    this.cancelWorkOrder.emit(workOrder);
  }

  protected statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'COMPLETED' || status === 'APPROVED' || status === 'CUSTOMER_NOTIFIED') {
      return 'success';
    }
    if (status === 'ON_HOLD' || status === 'PAUSED') {
      return 'warn';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  private resetCollectionView(): void {
    this.collection.pageIndex.set(0);
    this.collection.clearSelection();
  }

  private emitFilters(patch: Partial<WorkOrderListFilterChange>): void {
    this.resetCollectionView();
    const customFrom = patch.customFrom ?? this.customFrom();
    const customTo = patch.customTo ?? this.customTo();
    this.filtersChanged.emit({
      statusFilter: patch.statusFilter ?? this.statusFilter(),
      dateFilter: patch.dateFilter ?? this.dateFilter(),
      customFrom: customFrom || undefined,
      customTo: customTo || undefined
    });
  }
}

function isReviewLocked(status: string): boolean {
  return ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(status);
}

function canGenerateInvoice(status: string): boolean {
  return ['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED'].includes(status);
}

function canCancel(status: string): boolean {
  return !['CANCELLED', 'INVOICED', 'PAID'].includes(status);
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function priorityValue(priority: WorkOrderRecord['priority']): number {
  return { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 }[priority] ?? 0;
}
