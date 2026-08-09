import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { WorkerRecord } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

@Component({
  selector: 'lorne-worker-list',
  standalone: true,
  imports: [ButtonModule, CurrencyPipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search workers by name, employee number, phone, email, certification..."
        [query]="collection.query()"
        [totalCount]="workers().length"
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
          <table class="w-full min-w-[84rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Worker</th>
                <th class="px-3 py-3">Contact</th>
                <th class="px-3 py-3">Type</th>
                <th class="px-3 py-3">Rate</th>
                <th class="px-3 py-3">Skills</th>
                <th class="px-3 py-3">Availability</th>
                <th class="px-3 py-3">Emergency</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (worker of collection.page(); track worker.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(worker)" (change)="collection.toggle(worker)" />
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="font-bold text-slate-950">{{ worker.displayName }}</p>
                      <p-tag [value]="worker.status" [severity]="worker.status === 'ACTIVE' ? 'success' : worker.status === 'ON_LEAVE' ? 'warn' : 'secondary'" />
                      <p-tag [value]="worker.appLoginEnabled ? 'App login' : 'No login'" [severity]="worker.appLoginEnabled ? 'info' : 'secondary'" />
                    </div>
                    <p class="mt-1 text-xs font-semibold text-slate-500">{{ worker.employeeNumber || 'No employee #' }}</p>
                    @if (worker.status === 'ON_LEAVE') {
                      <p class="mt-1 text-xs font-bold text-amber-700">{{ leaveLabel(worker) }}</p>
                    }
                  </td>
                  <td class="px-3 py-3 text-slate-600">
                    <p>{{ worker.email || 'No email' }}</p>
                    <p class="text-xs text-slate-500">{{ worker.phone || 'No phone' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-slate-700">{{ engagementLabel(worker.engagementType) }}</p>
                    <p class="text-xs text-slate-500">{{ worker.maxWeeklyHours ? worker.maxWeeklyHours + ' hrs/week' : 'No weekly cap' }}</p>
                  </td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ worker.hourlyRate ? (worker.hourlyRate | currency:'CAD') : 'No rate' }}</td>
                  <td class="px-3 py-3">
                    <div class="flex max-w-xs flex-wrap gap-1">
                      @for (skill of worker.serviceSkills.slice(0, 3); track skill.serviceTypeId) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{{ skill.serviceName }}</span>
                      } @empty {
                        <span class="text-xs font-semibold text-amber-700">No skills</span>
                      }
                      @if (worker.serviceSkills.length > 3) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">+{{ worker.serviceSkills.length - 3 }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-3 py-3">
                    @if (worker.shifts.length) {
                      <p class="font-semibold text-slate-700">{{ shiftSummary(worker) }}</p>
                      <p class="text-xs text-slate-500">{{ worker.shifts[0].startTime }}-{{ worker.shifts[0].endTime }}</p>
                    } @else {
                      <span class="text-xs font-semibold text-amber-700">No shifts</span>
                    }
                  </td>
                  <td class="px-3 py-3">
                    @if (worker.emergencyContact) {
                      <p class="font-semibold text-slate-700">{{ worker.emergencyContact.contactName }}</p>
                      <p class="text-xs text-slate-500">{{ worker.emergencyContact.phone }}</p>
                    } @else {
                      <span class="text-xs font-semibold text-amber-700">Missing</span>
                    }
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openWorkerMenu(worker, $event, workerMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No workers found.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #workerMenu [popup]="true" [model]="workerMenuItems()" appendTo="body" />
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
export class WorkerListComponent {
  readonly workers = input.required<WorkerRecord[]>();
  readonly viewWorker = output<WorkerRecord>();
  readonly createAppLogin = output<WorkerRecord>();
  readonly editWorker = output<WorkerRecord>();
  readonly editWorkerSection = output<{ worker: WorkerRecord; tabIndex: number }>();
  readonly updateWorkerStatus = output<{ worker: WorkerRecord; status: string }>();
  readonly markWorkerOnLeave = output<WorkerRecord>();
  readonly assignEquipment = output<WorkerRecord>();
  readonly deleteWorker = output<WorkerRecord>();
  protected readonly selectedWorker = signal<WorkerRecord | null>(null);
  protected readonly workerMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<WorkerRecord>(
    this.workers,
    (worker) => worker.id,
    (worker) => [
      worker.displayName,
      worker.employeeNumber,
      worker.email,
      worker.phone,
      worker.status,
      worker.engagementType,
      worker.emergencyContact?.contactName,
      ...worker.certifications.map((certification) => certification.certificationName),
      ...worker.serviceSkills.map((skill) => skill.serviceName)
    ].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.displayName.localeCompare(right.displayName) },
      { label: 'Status A-Z', value: 'status-asc', compare: (left, right) => left.status.localeCompare(right.status) },
      { label: 'Hire date newest', value: 'hire-desc', compare: (left, right) => dateValue(right.hireDate) - dateValue(left.hireDate) },
      { label: 'Most skills', value: 'skills-desc', compare: (left, right) => right.serviceSkills.length - left.serviceSkills.length },
      { label: 'Rate highest', value: 'rate-desc', compare: (left, right) => (right.hourlyRate ?? 0) - (left.hourlyRate ?? 0) }
    ]
  );

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected shiftSummary(worker: WorkerRecord): string {
    const days = worker.shifts.map((shift) => dayLabel(shift.dayOfWeek));
    return days.length > 5 ? `${days.slice(0, 5).join(', ')} +${days.length - 5}` : days.join(', ');
  }

  protected leaveLabel(worker: WorkerRecord): string {
    const start = worker.leaveStartDate ? new Date(worker.leaveStartDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'start not set';
    const end = worker.leaveEndDate ? new Date(worker.leaveEndDate).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'end not set';
    return `On leave ${start} - ${end}`;
  }

  protected openWorkerMenu(worker: WorkerRecord, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedWorker.set(worker);
    this.workerMenuItems.set([
      {
        label: 'View 360',
        icon: 'pi pi-id-card',
        command: () => this.viewWorker.emit(worker)
      },
      { separator: true },
      {
        label: worker.appLoginEnabled ? 'Reset app login' : 'Create app login',
        icon: 'pi pi-key',
        command: () => this.createAppLogin.emit(worker)
      },
      { separator: true },
      { label: 'Update worker', icon: 'pi pi-pencil', command: () => this.editWorker.emit(worker) },
      { label: 'Shift schedule', icon: 'pi pi-calendar-clock', command: () => this.editWorkerSection.emit({ worker, tabIndex: 2 }) },
      { label: 'Service skills', icon: 'pi pi-wrench', command: () => this.editWorkerSection.emit({ worker, tabIndex: 1 }) },
      { label: 'Safety and certifications', icon: 'pi pi-verified', command: () => this.editWorkerSection.emit({ worker, tabIndex: 3 }) },
      { label: 'Assign equipment', icon: 'pi pi-briefcase', command: () => this.assignEquipment.emit(worker) },
      { separator: true },
      worker.status === 'ACTIVE'
        ? { label: 'Deactivate worker', icon: 'pi pi-ban', command: () => this.updateWorkerStatus.emit({ worker, status: 'INACTIVE' }) }
        : { label: 'Activate worker', icon: 'pi pi-check-circle', command: () => this.updateWorkerStatus.emit({ worker, status: 'ACTIVE' }) },
      { label: 'Mark on leave', icon: 'pi pi-pause-circle', command: () => this.markWorkerOnLeave.emit(worker) },
      { label: 'Terminate worker', icon: 'pi pi-times-circle', command: () => this.updateWorkerStatus.emit({ worker, status: 'TERMINATED' }) },
      { label: 'Delete worker', icon: 'pi pi-trash', command: () => this.deleteWorker.emit(worker) }
    ]);
    menu.toggle(event);
  }
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

function dayLabel(day: number): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1] ?? String(day);
}
