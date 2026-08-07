import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { WorkOrderRecord } from '@lorne/contracts';
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

export type WorkOrderReviewTarget = 'SUMMARY' | 'EVIDENCE' | 'TIME' | 'AUDIT';

export interface WorkOrderReviewRequest {
  workOrder: WorkOrderRecord;
  target: WorkOrderReviewTarget;
}

@Component({
  selector: 'lorne-work-order-list',
  standalone: true,
  imports: [ButtonModule, DatePipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
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

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[86rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
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
                  <td class="px-3 py-3 text-slate-600">{{ workOrder.scheduledStart ? (workOrder.scheduledStart | date:'MMM d, h:mm a') : 'Unscheduled' }}</td>
                  <td class="px-3 py-3">
                    <div class="flex max-w-xs flex-wrap gap-1">
                      @for (assignment of workOrder.assignments.slice(0, 2); track assignment.workerId) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{{ assignment.workerName }}</span>
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
  readonly editWorkOrder = output<WorkOrderEditRequest>();
  readonly reviewWorkOrder = output<WorkOrderReviewRequest>();
  readonly generateInvoiceWorkOrder = output<WorkOrderRecord>();
  protected readonly selectedWorkOrder = signal<WorkOrderRecord | null>(null);
  protected readonly workOrderMenuItems = signal<MenuItem[]>([]);
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

  protected openWorkOrderMenu(workOrder: WorkOrderRecord, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedWorkOrder.set(workOrder);
    const locked = isReviewLocked(workOrder.status);
    this.workOrderMenuItems.set([
      { label: workOrder.status === 'PENDING_COMPLETION' ? 'Review completion' : 'Full view', icon: 'pi pi-search', command: () => this.review(workOrder, 'SUMMARY') },
      { label: 'Print view', icon: 'pi pi-print', command: () => this.review(workOrder, 'SUMMARY') },
      { label: 'Evidence', icon: 'pi pi-camera', command: () => this.review(workOrder, 'EVIDENCE') },
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
      { label: 'Cancel order', icon: 'pi pi-ban', disabled: true }
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
}

function isReviewLocked(status: string): boolean {
  return ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(status);
}

function canGenerateInvoice(status: string): boolean {
  return ['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED'].includes(status);
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function priorityValue(priority: WorkOrderRecord['priority']): number {
  return { LOW: 1, NORMAL: 2, HIGH: 3, URGENT: 4 }[priority] ?? 0;
}
