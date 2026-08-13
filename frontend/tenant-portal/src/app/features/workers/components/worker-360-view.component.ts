import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { TenantAsset, WorkerRecord, WorkOrderRecord } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

type Worker360Tab = 'OVERVIEW' | 'WORK' | 'SCHEDULE' | 'TOOLS' | 'SAFETY';

@Component({
  selector: 'lorne-worker-360-view',
  standalone: true,
  imports: [ButtonModule, DatePipe, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex h-full flex-col gap-3 overflow-auto pr-1">
      <div class="rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 text-white">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-200">{{ worker().employeeNumber || 'No employee #' }}</p>
              <p-tag [value]="worker().status" [severity]="worker().status === 'ACTIVE' ? 'success' : worker().status === 'ON_LEAVE' ? 'warn' : 'secondary'" />
              <p-tag [value]="worker().appLoginEnabled ? 'App login' : 'No login'" [severity]="worker().appLoginEnabled ? 'info' : 'secondary'" />
            </div>
            <h2 class="mt-2 text-2xl font-black leading-tight">{{ worker().displayName }}</h2>
            <p class="mt-1 text-sm font-bold text-slate-200">{{ engagementLabel(worker().engagementType) }} · {{ worker().email || 'No email linked' }}</p>
            @if (worker().status === 'ON_LEAVE') {
              <p class="mt-2 inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-900">
                On leave {{ leaveLabel() }}{{ worker().leaveReason ? ' · ' + worker().leaveReason : '' }}
              </p>
            }
          </div>
          <div class="grid grid-cols-3 gap-2 text-right sm:min-w-[34rem] lg:grid-cols-6">
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Open</p>
              <p class="text-xl font-black">{{ openJobs().length }}</p>
            </div>
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Done</p>
              <p class="text-xl font-black">{{ completedJobs().length }}</p>
            </div>
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Actual</p>
              <p class="text-xl font-black">{{ totalActualHours() }}h</p>
            </div>
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Arrived</p>
              <p class="text-xl font-black">{{ arrivedJobs().length }}</p>
            </div>
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Finished</p>
              <p class="text-xl font-black">{{ finishedJobs().length }}</p>
            </div>
            <div class="rounded-lg bg-white/10 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-slate-300">Tools</p>
              <p class="text-xl font-black">{{ assignedAssets().length }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-5 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        @for (tab of tabs; track tab.value) {
          <button
            type="button"
            class="flex h-11 items-center justify-center gap-2 rounded-md px-2 text-xs font-black text-slate-500 transition hover:bg-white hover:text-teal-700 sm:text-sm"
            [class.border]="activeTab() === tab.value"
            [class.border-teal-300]="activeTab() === tab.value"
            [class.bg-teal-50]="activeTab() === tab.value"
            [class.text-teal-700]="activeTab() === tab.value"
            [class.shadow-sm]="activeTab() === tab.value"
            [attr.aria-pressed]="activeTab() === tab.value"
            (click)="activeTab.set(tab.value)"
          >
            <i [class]="tab.icon"></i>
            <span class="hidden sm:inline">{{ tab.label }}</span>
            <span class="sm:hidden">{{ tab.shortLabel }}</span>
          </button>
        }
      </div>

      @if (activeTab() === 'OVERVIEW') {
        <section class="grid gap-3 lg:grid-cols-[1fr_20rem]">
          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Contact and login</p>
              <p class="mt-2 text-sm font-black text-slate-950">{{ worker().email || 'No email' }}</p>
              <p class="mt-1 text-sm font-semibold text-slate-600">{{ worker().phone || 'No phone' }}</p>
              <p class="mt-2 text-xs font-bold text-slate-500">Worker app: {{ worker().appLoginEnabled ? 'enabled' : 'not created' }}</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3 md:col-span-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Actual field timing</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-3">
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-black text-slate-500">Actual hours</p>
                  <p class="text-lg font-black text-slate-950">{{ totalActualHours() }}</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-black text-slate-500">Arrived on site</p>
                  <p class="text-lg font-black text-slate-950">{{ arrivedJobs().length }}</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-black text-slate-500">Finished work</p>
                  <p class="text-lg font-black text-slate-950">{{ finishedJobs().length }}</p>
                </div>
              </div>
              <div class="mt-3 grid gap-2">
                @for (job of timedJobs().slice(0, 3); track job.id) {
                  @if (assignmentFor(job); as assignment) {
                    <div class="rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p class="text-sm font-black text-teal-700">{{ job.workOrderNumber }}</p>
                          <p class="text-sm font-bold text-slate-950">{{ job.title }}</p>
                          <p class="text-xs font-semibold text-slate-500">{{ job.propertyName }}</p>
                        </div>
                        <p class="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{{ minutesLabel(assignment.actualWorkMinutes || 0) }}</p>
                      </div>
                      <div class="mt-2 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-3">
                        <p><span class="block font-black uppercase text-slate-500">Arrived</span>{{ dateTimeOrDash(assignment.actualArrivedAt) }}</p>
                        <p><span class="block font-black uppercase text-slate-500">Work started</span>{{ dateTimeOrDash(assignment.actualWorkStartedAt) }}</p>
                        <p><span class="block font-black uppercase text-slate-500">Finished</span>{{ dateTimeOrDash(assignment.actualFinishedAt) }}</p>
                      </div>
                    </div>
                  }
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">No actual arrival or finish times recorded yet.</p>
                }
              </div>
              <p class="mt-2 text-xs font-bold text-slate-500">Based on worker on-site, work-start, and complete actions.</p>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Service capability</p>
              <div class="mt-2 flex flex-wrap gap-1">
                @for (skill of worker().serviceSkills; track skill.serviceTypeId) {
                  <span class="rounded-full bg-teal-50 px-2 py-1 text-xs font-black text-teal-800">{{ skill.serviceName }}</span>
                } @empty {
                  <span class="text-sm font-semibold text-amber-700">No service skills assigned.</span>
                }
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Emergency contact</p>
              @if (worker().emergencyContact; as contact) {
                <p class="mt-2 text-sm font-black text-slate-950">{{ contact.contactName }}</p>
                <p class="mt-1 text-sm font-semibold text-slate-600">{{ contact.relationship || 'Relationship not set' }}</p>
                <p class="mt-1 text-sm font-semibold text-slate-600">{{ contact.phone }}</p>
              } @else {
                <p class="mt-2 text-sm font-semibold text-amber-700">Missing emergency contact.</p>
              }
            </div>
          </div>

          <aside class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Quick actions</p>
              <div class="mt-2 grid gap-2">
                <button pButton type="button" size="small" icon="pi pi-pencil" label="Update profile" (click)="editWorker.emit(worker())"></button>
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-calendar-clock" label="Edit shifts" (click)="editWorkerSection.emit({ worker: worker(), tabIndex: 2 })"></button>
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-wrench" label="Edit skills" (click)="editWorkerSection.emit({ worker: worker(), tabIndex: 1 })"></button>
                @if (canManageAppLogins()) {
                  <button pButton type="button" size="small" severity="secondary" icon="pi pi-key" [label]="worker().appLoginEnabled ? 'Reset app login' : 'Create app login'" (click)="createAppLogin.emit(worker())"></button>
                }
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-calendar-plus" label="Assign work order" (click)="assignWorkOrder.emit(worker())"></button>
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-briefcase" label="Assign equipment" (click)="assignEquipment.emit(worker())"></button>
              </div>
            </div>
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Current workload</p>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-black text-slate-500">Today</p>
                  <p class="text-lg font-black text-slate-950">{{ todayJobs().length }}</p>
                </div>
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-xs font-black text-slate-500">Upcoming</p>
                  <p class="text-lg font-black text-slate-950">{{ upcomingJobs().length }}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      }

      @if (activeTab() === 'WORK') {
        <section class="rounded-lg border border-slate-200 bg-white p-3">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Assigned work orders</p>
              <h3 class="text-lg font-black text-slate-950">{{ workerJobs().length }} total assignments</h3>
            </div>
            <div class="flex flex-wrap gap-2">
              <p-tag [value]="openJobs().length + ' open'" severity="info" />
              <p-tag [value]="completedJobs().length + ' completed'" severity="success" />
            </div>
          </div>
          <div class="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table class="w-full min-w-[68rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-2">Work order</th>
                  <th class="px-3 py-2">Property</th>
                  <th class="px-3 py-2">Schedule</th>
                  <th class="px-3 py-2">Actual timing</th>
                  <th class="px-3 py-2">Assignment</th>
                  <th class="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (job of workerJobs().slice(0, 20); track job.id) {
                  <tr>
                    <td class="px-3 py-2">
                      <p class="font-black text-teal-700">{{ job.workOrderNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ job.title }}</p>
                    </td>
                    <td class="px-3 py-2">
                      <p class="font-bold text-slate-800">{{ job.propertyName }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ job.ownerName }}</p>
                    </td>
                    <td class="px-3 py-2 font-semibold text-slate-600">{{ scheduleLabel(job) }}</td>
                    <td class="px-3 py-2">
                      @if (assignmentFor(job); as assignment) {
                        <div class="grid gap-1 text-xs">
                          <p><span class="font-black text-slate-950">Arrived:</span> <span class="font-semibold text-slate-600">{{ dateTimeOrDash(assignment.actualArrivedAt) }}</span></p>
                          <p><span class="font-black text-slate-950">Work started:</span> <span class="font-semibold text-slate-600">{{ dateTimeOrDash(assignment.actualWorkStartedAt) }}</span></p>
                          <p><span class="font-black text-slate-950">Finished:</span> <span class="font-semibold text-slate-600">{{ dateTimeOrDash(assignment.actualFinishedAt) }}</span></p>
                          <p><span class="font-black text-slate-950">Duration:</span> <span class="font-semibold text-slate-600">{{ minutesLabel(assignment.actualWorkMinutes || 0) }}</span></p>
                        </div>
                      } @else {
                        <p class="text-xs font-semibold text-slate-500">Not assigned</p>
                      }
                    </td>
                    <td class="px-3 py-2">
                      <p-tag [value]="assignmentFor(job)?.leadWorker ? 'lead' : 'assigned'" [severity]="assignmentFor(job)?.leadWorker ? 'info' : 'secondary'" />
                    </td>
                    <td class="px-3 py-2"><p-tag [value]="statusLabel(job.status)" [severity]="statusSeverity(job.status)" /></td>
                  </tr>
                } @empty {
                  <tr><td colspan="6" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No work orders assigned to this worker.</td></tr>
                }
              </tbody>
            </table>
          </div>
          @if (workerJobs().length > 20) {
            <p class="mt-2 text-xs font-bold text-slate-500">Showing latest 20 of {{ workerJobs().length }} assignments.</p>
          }
        </section>
      }

      @if (activeTab() === 'SCHEDULE') {
        <section class="grid gap-3 lg:grid-cols-[1fr_18rem]">
          <div class="rounded-lg border border-slate-200 bg-white p-3">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Weekly shifts</p>
            <div class="mt-3 grid gap-2 md:grid-cols-2">
              @for (shift of sortedShifts(); track shift.id || shift.dayOfWeek + shift.startTime) {
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p class="text-sm font-black text-slate-950">{{ dayLabel(shift.dayOfWeek) }}</p>
                  <p class="mt-1 text-sm font-semibold text-slate-600">{{ shift.startTime }} - {{ shift.endTime }}</p>
                  <p class="mt-1 text-xs font-bold text-slate-500">{{ shift.timezone }}</p>
                </div>
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-amber-700 md:col-span-2">No shift schedule configured.</p>
              }
            </div>
          </div>
          <aside class="rounded-lg border border-slate-200 bg-white p-3">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Schedule health</p>
            <div class="mt-3 grid gap-2">
              <div class="rounded-lg bg-slate-50 px-3 py-2">
                <p class="text-xs font-black text-slate-500">Shift days</p>
                <p class="text-lg font-black text-slate-950">{{ worker().shifts.length }}</p>
              </div>
              <div class="rounded-lg bg-slate-50 px-3 py-2">
                <p class="text-xs font-black text-slate-500">Scheduled next</p>
                <p class="text-sm font-black text-slate-950">{{ nextJobLabel() }}</p>
              </div>
            </div>
          </aside>
        </section>
      }

      @if (activeTab() === 'TOOLS') {
        <section class="rounded-lg border border-slate-200 bg-white p-3">
          <p class="text-xs font-black uppercase tracking-wide text-teal-700">Tools and equipment assigned</p>
          <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            @for (asset of assignedAssets(); track asset.id) {
              <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-black text-slate-950">{{ asset.name }}</p>
                    <p class="mt-1 text-xs font-bold text-slate-500">{{ asset.assetType }} · {{ asset.identifier || 'No identifier' }}</p>
                  </div>
                  <p-tag [value]="asset.active ? 'active' : 'inactive'" [severity]="asset.active ? 'success' : 'secondary'" />
                </div>
                <p class="mt-2 text-xs font-semibold text-slate-500">Location: {{ asset.storageLocation || 'With worker' }}</p>
              </div>
            } @empty {
              <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">No tools or equipment assigned.</p>
            }
          </div>
        </section>
      }

      @if (activeTab() === 'SAFETY') {
        <section class="grid gap-3 lg:grid-cols-2">
          <div class="rounded-lg border border-slate-200 bg-white p-3">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Certifications</p>
            <div class="mt-3 grid gap-2">
              @for (certification of worker().certifications; track certification.id || certification.certificationName) {
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p class="text-sm font-black text-slate-950">{{ certification.certificationName }}</p>
                  <p class="mt-1 text-xs font-bold text-slate-500">{{ certification.issuedBy || 'Issuer not set' }}</p>
                  <p class="mt-1 text-xs font-semibold text-slate-500">
                    Issued {{ certification.issuedOn ? (certification.issuedOn | date:'MMM d, y') : '-' }} · Expires {{ certification.expiresOn ? (certification.expiresOn | date:'MMM d, y') : '-' }}
                  </p>
                </div>
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-amber-700">No certifications recorded.</p>
              }
            </div>
          </div>
          <div class="rounded-lg border border-slate-200 bg-white p-3">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Readiness gaps</p>
            <div class="mt-3 grid gap-2">
              @for (gap of readinessGaps(); track gap) {
                <p class="rounded-lg bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{{ gap }}</p>
              } @empty {
                <p class="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">Profile looks ready for dispatch.</p>
              }
            </div>
          </div>
        </section>
      }
    </section>
  `
})
export class Worker360ViewComponent {
  readonly worker = input.required<WorkerRecord>();
  readonly workOrders = input.required<WorkOrderRecord[]>();
  readonly assets = input.required<TenantAsset[]>();
  readonly canManageAppLogins = input(false);
  readonly createAppLogin = output<WorkerRecord>();
  readonly editWorker = output<WorkerRecord>();
  readonly editWorkerSection = output<{ worker: WorkerRecord; tabIndex: number }>();
  readonly assignWorkOrder = output<WorkerRecord>();
  readonly assignEquipment = output<WorkerRecord>();

  protected readonly activeTab = signal<Worker360Tab>('OVERVIEW');
  protected readonly tabs: Array<{ value: Worker360Tab; label: string; shortLabel: string; icon: string }> = [
    { value: 'OVERVIEW', label: 'Overview', shortLabel: 'Info', icon: 'pi pi-id-card' },
    { value: 'WORK', label: 'Work', shortLabel: 'Work', icon: 'pi pi-briefcase' },
    { value: 'SCHEDULE', label: 'Schedule', shortLabel: 'Plan', icon: 'pi pi-calendar-clock' },
    { value: 'TOOLS', label: 'Tools', shortLabel: 'Tools', icon: 'pi pi-box' },
    { value: 'SAFETY', label: 'Safety', shortLabel: 'Safe', icon: 'pi pi-verified' }
  ];

  protected readonly workerJobs = computed(() => this.workOrders()
    .filter((workOrder) => workOrder.assignments.some((assignment) => assignment.workerId === this.worker().id))
    .sort((left, right) => dateValue(right.scheduledStart) - dateValue(left.scheduledStart)));

  protected readonly openJobs = computed(() => this.workerJobs().filter((job) => !terminalStatuses.has(job.status)));
  protected readonly completedJobs = computed(() => this.workerJobs().filter((job) => ['COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(job.status)));
  protected readonly assignedAssets = computed(() => this.assets().filter((asset) => asset.assignedWorkerId === this.worker().id));
  protected readonly todayJobs = computed(() => this.workerJobs().filter((job) => isToday(job.scheduledStart)));
  protected readonly upcomingJobs = computed(() => this.workerJobs().filter((job) => isFuture(job.scheduledStart)));
  protected readonly arrivedJobs = computed(() => this.workerJobs().filter((job) => Boolean(this.assignmentFor(job)?.actualArrivedAt)));
  protected readonly finishedJobs = computed(() => this.workerJobs().filter((job) => Boolean(this.assignmentFor(job)?.actualFinishedAt)));
  protected readonly timedJobs = computed(() => this.workerJobs().filter((job) => {
    const assignment = this.assignmentFor(job);
    return Boolean(assignment?.actualArrivedAt || assignment?.actualWorkStartedAt || assignment?.actualFinishedAt || assignment?.actualWorkMinutes);
  }));
  protected readonly sortedShifts = computed(() => [...this.worker().shifts].sort((left, right) => left.dayOfWeek - right.dayOfWeek || left.startTime.localeCompare(right.startTime)));

  protected assignmentFor(workOrder: WorkOrderRecord) {
    return workOrder.assignments.find((assignment) => assignment.workerId === this.worker().id);
  }

  protected readinessGaps(): string[] {
    const gaps: string[] = [];
    if (!this.worker().appLoginEnabled) {
      gaps.push('Worker app login has not been created.');
    }
    if (this.worker().serviceSkills.length === 0) {
      gaps.push('No service skills are assigned.');
    }
    if (this.worker().shifts.length === 0) {
      gaps.push('No shift schedule is configured.');
    }
    if (!this.worker().emergencyContact) {
      gaps.push('Emergency contact is missing.');
    }
    if (this.worker().certifications.length === 0) {
      gaps.push('No certifications recorded.');
    }
    return gaps;
  }

  protected nextJobLabel(): string {
    const nextJob = this.workerJobs()
      .filter((job) => isFuture(job.scheduledStart))
      .sort((left, right) => dateValue(left.scheduledStart) - dateValue(right.scheduledStart))[0];
    return nextJob ? `${nextJob.workOrderNumber} · ${new Date(nextJob.scheduledStart || '').toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'No upcoming job';
  }

  protected totalActualHours(): number {
    const minutes = this.workerJobs()
      .reduce((total, workOrder) => total + (this.assignmentFor(workOrder)?.actualWorkMinutes ?? 0), 0);
    return Math.round((minutes / 60) * 10) / 10;
  }

  protected dateTimeOrDash(value?: string): string {
    return value ? fullDateTime(value) : '-';
  }

  protected minutesLabel(minutes: number): string {
    return minutesLabel(minutes);
  }

  protected leaveLabel(): string {
    const start = this.worker().leaveStartDate ? new Date(this.worker().leaveStartDate || '').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'start not set';
    const end = this.worker().leaveEndDate ? new Date(this.worker().leaveEndDate || '').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'end not set';
    return `${start} - ${end}`;
  }

  protected scheduleLabel(workOrder: WorkOrderRecord): string {
    if (!workOrder.scheduledStart) {
      return 'Unscheduled';
    }
    const start = new Date(workOrder.scheduledStart);
    const end = workOrder.scheduledEnd ? new Date(workOrder.scheduledEnd) : null;
    const startLabel = start.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const endLabel = end?.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return endLabel ? `${startLabel} - ${endLabel}` : startLabel;
  }

  protected statusLabel(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (['COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(status)) {
      return 'success';
    }
    if (['PENDING_COMPLETION', 'ON_HOLD', 'PAUSED'].includes(status)) {
      return 'warn';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  protected engagementLabel(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected dayLabel(day: number): string {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1] ?? String(day);
  }
}

const terminalStatuses = new Set(['COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED']);

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}

function isToday(value?: string): boolean {
  if (!value) {
    return false;
  }
  const date = new Date(value);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function isFuture(value?: string): boolean {
  return Boolean(value && new Date(value).getTime() >= Date.now());
}

function fullDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function minutesLabel(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
