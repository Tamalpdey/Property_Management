import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import type { WorkerActivity, WorkerDailyLoadout, WorkerLoadoutTool, WorkerLoadoutToolActionRequest } from '@lorne/contracts';
import { WorkerShiftClockService } from '../../core/services/worker-shift-clock.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import { parseDateInput, toDateInput, workerErrorMessage } from '../today/worker-job-ui';

@Component({
  selector: 'lorne-worker-loadout',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl space-y-3">
      <div class="overflow-hidden rounded-lg border border-slate-800 bg-slate-950 text-white shadow-xl shadow-teal-950/15">
        <div class="flex flex-wrap items-start justify-between gap-3 p-3 sm:p-5">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-md bg-teal-300 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-slate-950">Daily loadout</span>
              <span class="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold text-teal-50">{{ selectedDateLabel() }}</span>
            </div>
            <h1 class="mt-2 text-2xl font-black leading-tight sm:text-4xl">Tools, equipment, and materials</h1>
            <p class="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-300">
              Review the day’s assigned job resources, check out tools before leaving, and return or flag them at the end of work.
            </p>
          </div>
          <button
            pButton
            type="button"
            severity="secondary"
            icon="pi pi-refresh"
            label="Refresh"
            [loading]="loading()"
            (click)="load()"
          ></button>
        </div>
        <div class="grid grid-cols-5 border-t border-white/10 bg-white/[0.04]">
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Jobs</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ loadout()?.scheduledJobs ?? 0 }}</span>
          </div>
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Tools</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ loadout()?.toolCount ?? 0 }}</span>
          </div>
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Out</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ loadout()?.checkedOutCount ?? 0 }}</span>
          </div>
          <div class="border-r border-white/10 px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Back</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ loadout()?.returnedCount ?? 0 }}</span>
          </div>
          <div class="px-2 py-2.5 sm:px-4 sm:py-3">
            <span class="block text-[0.58rem] font-bold uppercase tracking-wide text-slate-400 sm:text-[0.7rem]">Issues</span>
            <span class="mt-0.5 block text-lg font-black sm:text-2xl">{{ loadout()?.issueCount ?? 0 }}</span>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }

      @if (!clock.clockedIn()) {
        <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
          Clock in before checking out, returning, or reporting tools. You can still review the loadout.
        </p>
      }

      <div class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
        <div class="grid gap-2 md:grid-cols-[12rem_1fr_12rem]">
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Date
            <input type="date" class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="selectedDate" (change)="load()" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Search
            <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Search tool, job, property" [(ngModel)]="search" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Status
            <select class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="statusFilter">
              <option value="ALL">All</option>
              <option value="PLANNED">Planned</option>
              <option value="CHECKED_OUT">Checked out</option>
              <option value="RETURNED">Returned</option>
              <option value="DAMAGED">Issues</option>
            </select>
          </label>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
          <div class="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker activity</p>
                <h2 class="text-lg font-black text-slate-950">Office, supplier, shop time</h2>
                <p class="mt-1 text-xs font-bold text-slate-500">Use this for time away from a property job. It prints on Day Ticket.</p>
              </div>
              @if (openActivity(); as activity) {
                <button
                  pButton
                  type="button"
                  size="small"
                  severity="danger"
                  icon="pi pi-stop-circle"
                  label="End activity"
                  [disabled]="!clock.clockedIn() || !!busyKey()"
                  [loading]="busyKey() === activityKey(activity, 'END')"
                  (click)="openEndActivityDialog(activity)"
                ></button>
              } @else {
                <button
                  pButton
                  type="button"
                  size="small"
                  icon="pi pi-play"
                  label="Start activity"
                  [disabled]="!clock.clockedIn() || !!busyKey()"
                  [loading]="busyKey() === 'activity-start'"
                  (click)="openStartActivityDialog()"
                ></button>
              }
            </div>

            @if (openActivity(); as activity) {
              <article class="mt-3 rounded-lg border border-teal-200 bg-white p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ activityLabel(activity.activityType) }}</p>
                    <p class="text-base font-black text-slate-950">{{ activity.title }}</p>
                    @if (activity.locationName || activity.address) {
                      <p class="text-xs font-bold text-slate-500">{{ activity.locationName }}{{ activity.locationName && activity.address ? ' · ' : '' }}{{ activity.address }}</p>
                    }
                  </div>
                  <span class="rounded-full bg-teal-100 px-2.5 py-1 text-xs font-black text-teal-800">Started {{ activity.startedAt | date:'h:mm a' }}</span>
                </div>
              </article>
            }

            @if (loadout()?.activities?.length) {
              <div class="mt-3 grid gap-2 sm:grid-cols-2">
                @for (activity of loadout()?.activities?.slice(0, 4) ?? []; track activity.id) {
                  <div class="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <div class="min-w-0">
                        <p class="truncate text-sm font-black text-slate-950">{{ activity.title }}</p>
                        <p class="text-xs font-bold text-slate-500">{{ activityLabel(activity.activityType) }} · {{ activity.startedAt | date:'h:mm a' }}{{ activity.endedAt ? ' - ' + (activity.endedAt | date:'h:mm a') : ' - active' }}</p>
                      </div>
                      <span class="rounded-full px-2 py-0.5 text-[0.65rem] font-black uppercase" [class]="activity.open ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'">
                        {{ activity.open ? 'active' : durationLabel(activity.durationMinutes) }}
                      </span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Tools and equipment</p>
              <h2 class="text-xl font-black text-slate-950">Daily checkout list</h2>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ filteredTools().length }} visible</span>
          </div>

          <div class="mt-3 grid gap-2">
            @for (tool of filteredTools(); track tool.workOrderId + '-' + tool.assetId) {
              <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-black text-slate-950">{{ tool.name }}</span>
                      <span class="rounded-full px-2 py-0.5 text-[0.68rem] font-black uppercase" [class]="statusClass(tool.status)">{{ statusLabel(tool.status) }}</span>
                    </div>
                    <p class="mt-1 text-xs font-bold uppercase tracking-wide text-slate-500">{{ tool.assetType }}{{ tool.identifier ? ' · ' + tool.identifier : '' }}</p>
                    <button type="button" class="mt-2 text-left text-sm font-black text-teal-700" (click)="openJob(tool.workOrderId)">
                      {{ tool.workOrderNumber }} · {{ tool.workOrderTitle }}
                    </button>
                    <p class="text-sm font-semibold text-slate-600">{{ tool.propertyName }}</p>
                    @if (tool.issueNote) {
                      <p class="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">{{ tool.issueNote }}</p>
                    }
                  </div>
                  <div class="grid w-full grid-cols-3 gap-2 sm:w-auto">
                    <button
                      pButton
                      type="button"
                      size="small"
                      severity="success"
                      icon="pi pi-check"
                      label="Out"
                      [disabled]="actionDisabled(tool, 'CHECKED_OUT')"
                      [loading]="busyKey() === key(tool, 'CHECKED_OUT')"
                      (click)="checkOut(tool)"
                    ></button>
                    <button
                      pButton
                      type="button"
                      size="small"
                      severity="secondary"
                      icon="pi pi-undo"
                      label="Return"
                      [disabled]="actionDisabled(tool, 'RETURNED')"
                      [loading]="busyKey() === key(tool, 'RETURNED')"
                      (click)="returnTool(tool)"
                    ></button>
                    <button
                      pButton
                      type="button"
                      size="small"
                      severity="danger"
                      icon="pi pi-exclamation-triangle"
                      label="Issue"
                      [disabled]="!clock.clockedIn() || loading()"
                      [loading]="busyKey() === key(tool, 'DAMAGED')"
                      (click)="reportIssue(tool)"
                    ></button>
                  </div>
                </div>
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500">
                No tools or equipment match this date and filter.
              </div>
            }
          </div>
        </section>

        <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials</p>
              <h2 class="text-xl font-black text-slate-950">Needed today</h2>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ loadout()?.materials?.length ?? 0 }}</span>
          </div>
          <div class="mt-3 grid gap-2">
            @for (material of loadout()?.materials ?? []; track material.materialId) {
              <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <p class="font-black text-slate-950">{{ material.itemName || material.description || 'Material' }}</p>
                    <p class="text-sm font-semibold text-slate-600">{{ material.quantity }}{{ material.unit ? ' ' + material.unit : '' }} · {{ material.workOrderTitle }}</p>
                    <button type="button" class="mt-1 text-left text-xs font-black text-teal-700" (click)="openJob(material.workOrderId)">
                      {{ material.workOrderNumber }} · {{ material.propertyName }}
                    </button>
                  </div>
                  <span class="rounded-full px-2 py-0.5 text-[0.68rem] font-black uppercase" [class]="material.used ? 'bg-teal-100 text-teal-800' : 'bg-amber-100 text-amber-800'">
                    {{ material.used ? 'used' : 'planned' }}
                  </span>
                </div>
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm font-bold text-slate-500">
                No planned materials for this day.
              </div>
            }
          </div>
        </section>
      </div>

      <p-dialog
        [(visible)]="activityDialogVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: 'min(92vw, 30rem)' }"
        [contentStyle]="{ padding: '0' }"
        (onHide)="resetActivityDialog()"
      >
        <ng-template pTemplate="header">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker activity</p>
            <h2 class="text-lg font-black text-slate-950">{{ activityDialogMode === 'START' ? 'Start activity' : 'End activity' }}</h2>
          </div>
        </ng-template>

        <form class="grid gap-3 p-4" (ngSubmit)="submitActivityDialog()">
          @if (activityDialogMode === 'START') {
            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Activity type
              <select class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" name="activityType" [(ngModel)]="activityForm.activityType" (ngModelChange)="syncDefaultActivityTitle()">
                <option value="OFFICE">Office visit</option>
                <option value="SUPPLIER">Supplier stop</option>
                <option value="SHOP">Shop work</option>
                <option value="WAREHOUSE">Warehouse stop</option>
                <option value="BREAK">Break</option>
                <option value="OTHER">Other activity</option>
              </select>
            </label>

            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Activity title <span class="sr-only">required</span>
              <input
                class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                name="activityTitle"
                required
                placeholder="Example: Pick up chemicals"
                [(ngModel)]="activityForm.title"
              />
            </label>

            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Location name
              <input
                class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                name="activityLocationName"
                placeholder="Office, supplier, warehouse"
                [(ngModel)]="activityForm.locationName"
              />
            </label>

            <label class="grid gap-1 text-sm font-bold text-slate-700">
              Address
              <input
                class="h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                name="activityAddress"
                placeholder="Optional address"
                [(ngModel)]="activityForm.address"
              />
            </label>
          } @else if (selectedActivity) {
            <div class="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ activityLabel(selectedActivity.activityType) }}</p>
              <p class="text-base font-black text-slate-950">{{ selectedActivity.title }}</p>
              <p class="text-xs font-bold text-slate-600">Started {{ selectedActivity.startedAt | date:'MMM d, h:mm a' }}</p>
            </div>
          }

          <label class="grid gap-1 text-sm font-bold text-slate-700">
            {{ activityDialogMode === 'START' ? 'Start notes' : 'End notes' }}
            <textarea
              class="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
              name="activityNotes"
              placeholder="Optional notes for dispatch and Day Ticket"
              [(ngModel)]="activityForm.notes"
            ></textarea>
          </label>

          <div class="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closeActivityDialog()"></button>
            <button
              pButton
              type="submit"
              [severity]="activityDialogMode === 'START' ? 'success' : 'danger'"
              [icon]="activityDialogMode === 'START' ? 'pi pi-play' : 'pi pi-stop-circle'"
              [label]="activityDialogMode === 'START' ? 'Start' : 'End'"
              [disabled]="activityDialogMode === 'START' && !activityForm.title.trim()"
              [loading]="busyKey() === 'activity-start' || (selectedActivity ? busyKey() === activityKey(selectedActivity, 'END') : false)"
            ></button>
          </div>
        </form>
      </p-dialog>

      <p-dialog
        [(visible)]="toolIssueDialogVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: 'min(92vw, 30rem)' }"
        [contentStyle]="{ padding: '0' }"
        (onHide)="resetToolIssueDialog()"
      >
        <ng-template pTemplate="header">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-red-700">Tool issue</p>
            <h2 class="text-lg font-black text-slate-950">Report equipment problem</h2>
          </div>
        </ng-template>

        <form class="grid gap-3 p-4" (ngSubmit)="submitToolIssue()">
          @if (selectedIssueTool; as tool) {
            <div class="rounded-lg border border-red-100 bg-red-50 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-red-700">{{ tool.assetType }}</p>
              <p class="text-base font-black text-slate-950">{{ tool.name }}</p>
              <p class="text-xs font-bold text-slate-600">{{ tool.workOrderNumber }} · {{ tool.propertyName }}</p>
            </div>
          }

          <label class="grid gap-1 text-sm font-bold text-slate-700">
            What happened? <span class="text-red-600">*</span>
            <textarea
              class="min-h-28 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800"
              name="toolIssueNote"
              required
              placeholder="Example: Ladder hinge is bent. Do not use until repaired."
              [(ngModel)]="toolIssueForm.note"
            ></textarea>
          </label>

          <div class="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closeToolIssueDialog()"></button>
            <button
              pButton
              type="submit"
              severity="danger"
              icon="pi pi-exclamation-triangle"
              label="Report issue"
              [disabled]="!toolIssueForm.note.trim()"
              [loading]="selectedIssueTool ? busyKey() === key(selectedIssueTool, 'DAMAGED') : false"
            ></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class WorkerLoadoutComponent {
  private readonly workerJobService = inject(WorkerJobService);
  private readonly router = inject(Router);
  protected readonly clock = inject(WorkerShiftClockService);

  protected readonly loadout = signal<WorkerDailyLoadout | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly busyKey = signal('');
  protected selectedDate = toDateInput(new Date());
  protected search = '';
  protected statusFilter = 'ALL';
  protected activityDialogVisible = false;
  protected activityDialogMode: 'START' | 'END' = 'START';
  protected selectedActivity: WorkerActivity | null = null;
  protected activityForm = this.defaultActivityForm('OFFICE');
  protected toolIssueDialogVisible = false;
  protected selectedIssueTool: WorkerLoadoutTool | null = null;
  protected toolIssueForm = { note: '' };

  protected readonly openActivity = computed(() => (this.loadout()?.activities ?? []).find((activity) => activity.open));

  protected readonly filteredTools = computed(() => {
    const search = this.search.trim().toLowerCase();
    const statusFilter = this.statusFilter;
    return (this.loadout()?.tools ?? []).filter((tool) => {
      const statusMatch = statusFilter === 'ALL'
        || tool.status === statusFilter
        || (statusFilter === 'DAMAGED' && ['DAMAGED', 'MISSING'].includes(tool.status));
      if (!statusMatch) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        tool.name,
        tool.identifier,
        tool.assetType,
        tool.workOrderNumber,
        tool.workOrderTitle,
        tool.propertyName
      ].some((value) => value?.toLowerCase().includes(search));
    });
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.loadout(this.selectedDate)));
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load daily loadout. Try again or contact dispatch.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async checkOut(tool: WorkerLoadoutTool): Promise<void> {
    await this.runToolAction(tool, 'CHECKED_OUT', (date, request) => this.workerJobService.checkOutLoadoutTool(date, request));
  }

  protected async returnTool(tool: WorkerLoadoutTool): Promise<void> {
    await this.runToolAction(tool, 'RETURNED', (date, request) => this.workerJobService.returnLoadoutTool(date, request));
  }

  protected reportIssue(tool: WorkerLoadoutTool): void {
    if (!this.clock.clockedIn() || this.loading() || this.busyKey()) {
      return;
    }
    this.selectedIssueTool = tool;
    this.toolIssueForm = { note: tool.issueNote || '' };
    this.toolIssueDialogVisible = true;
  }

  protected closeToolIssueDialog(): void {
    this.toolIssueDialogVisible = false;
  }

  protected resetToolIssueDialog(): void {
    if (!this.toolIssueDialogVisible) {
      this.selectedIssueTool = null;
      this.toolIssueForm = { note: '' };
    }
  }

  protected async submitToolIssue(): Promise<void> {
    const tool = this.selectedIssueTool;
    const note = this.toolIssueForm.note.trim();
    if (!tool || !note) {
      this.error.set('Describe the tool or equipment issue before submitting.');
      return;
    }
    await this.runToolAction(
      tool,
      'DAMAGED',
      (date, request) => this.workerJobService.reportLoadoutToolIssue(date, { ...request, note })
    );
    this.closeToolIssueDialog();
  }

  protected openStartActivityDialog(): void {
    this.activityDialogMode = 'START';
    this.selectedActivity = null;
    this.activityForm = this.defaultActivityForm('OFFICE');
    this.activityDialogVisible = true;
  }

  protected openEndActivityDialog(activity: WorkerActivity): void {
    this.activityDialogMode = 'END';
    this.selectedActivity = activity;
    this.activityForm = {
      activityType: activity.activityType || 'OTHER',
      title: activity.title || this.defaultActivityTitle(activity.activityType),
      locationName: activity.locationName || '',
      address: activity.address || '',
      notes: activity.notes || ''
    };
    this.activityDialogVisible = true;
  }

  protected closeActivityDialog(): void {
    this.activityDialogVisible = false;
  }

  protected resetActivityDialog(): void {
    if (!this.activityDialogVisible) {
      this.selectedActivity = null;
      this.activityForm = this.defaultActivityForm('OFFICE');
      this.activityDialogMode = 'START';
    }
  }

  protected syncDefaultActivityTitle(): void {
    const currentTitle = this.activityForm.title.trim();
    const knownTitles = ['Office visit', 'Supplier stop', 'Shop work', 'Warehouse stop', 'Break', 'Other activity'];
    if (!currentTitle || knownTitles.includes(currentTitle)) {
      this.activityForm.title = this.defaultActivityTitle(this.activityForm.activityType);
    }
  }

  protected async submitActivityDialog(): Promise<void> {
    if (this.activityDialogMode === 'START') {
      await this.startActivity();
      return;
    }
    if (this.selectedActivity) {
      await this.endActivity(this.selectedActivity);
    }
  }

  private async startActivity(): Promise<void> {
    if (!this.clock.clockedIn() || this.busyKey()) {
      return;
    }
    const activityType = this.activityForm.activityType || 'OFFICE';
    const title = this.activityForm.title.trim() || this.defaultActivityTitle(activityType);
    this.busyKey.set('activity-start');
    this.error.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.startActivity(this.selectedDate, {
        activityType,
        title,
        locationName: this.activityForm.locationName.trim(),
        address: this.activityForm.address.trim(),
        notes: this.activityForm.notes.trim()
      })));
      this.closeActivityDialog();
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to start worker activity. Clock in and try again.'));
    } finally {
      this.busyKey.set('');
    }
  }

  private async endActivity(activity: WorkerActivity): Promise<void> {
    if (!this.clock.clockedIn() || this.busyKey()) {
      return;
    }
    this.busyKey.set(this.activityKey(activity, 'END'));
    this.error.set('');
    try {
      this.loadout.set(await firstValueFrom(this.workerJobService.endActivity(this.selectedDate, activity.id, {
        notes: this.activityForm.notes.trim()
      })));
      this.closeActivityDialog();
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to end worker activity. Try again or contact dispatch.'));
    } finally {
      this.busyKey.set('');
    }
  }

  protected actionDisabled(tool: WorkerLoadoutTool, status: 'CHECKED_OUT' | 'RETURNED'): boolean {
    if (!this.clock.clockedIn() || this.loading() || this.busyKey()) {
      return true;
    }
    if (status === 'CHECKED_OUT') {
      return ['CHECKED_OUT', 'RETURNED', 'DAMAGED', 'MISSING'].includes(tool.status);
    }
    return tool.status === 'RETURNED';
  }

  protected selectedDateLabel(): string {
    return parseDateInput(this.selectedDate).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  protected openJob(workOrderId: string): void {
    void this.router.navigate(['/jobs', workOrderId]);
  }

  protected statusLabel(status: string): string {
    return status.replaceAll('_', ' ').toLowerCase();
  }

  protected statusClass(status: string): string {
    if (status === 'RETURNED') {
      return 'bg-teal-100 text-teal-800';
    }
    if (status === 'CHECKED_OUT') {
      return 'bg-blue-100 text-blue-800';
    }
    if (['DAMAGED', 'MISSING'].includes(status)) {
      return 'bg-red-100 text-red-800';
    }
    return 'bg-slate-200 text-slate-700';
  }

  protected key(tool: WorkerLoadoutTool, action: string): string {
    return `${tool.workOrderId}-${tool.assetId}-${action}`;
  }

  protected activityKey(activity: WorkerActivity, action: string): string {
    return `${activity.id}-${action}`;
  }

  protected activityLabel(value: string): string {
    return value.replaceAll('_', ' ').toLowerCase();
  }

  protected durationLabel(minutes?: number): string {
    if (!minutes) {
      return '0m';
    }
    if (minutes < 60) {
      return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  private defaultActivityTitle(activityType: string): string {
    switch (activityType.trim().toUpperCase()) {
      case 'SUPPLIER':
        return 'Supplier stop';
      case 'SHOP':
        return 'Shop work';
      case 'WAREHOUSE':
        return 'Warehouse stop';
      case 'BREAK':
        return 'Break';
      case 'OTHER':
        return 'Other activity';
      default:
        return 'Office visit';
    }
  }

  private defaultActivityForm(activityType: string) {
    return {
      activityType,
      title: this.defaultActivityTitle(activityType),
      locationName: '',
      address: '',
      notes: ''
    };
  }

  private async runToolAction(
    tool: WorkerLoadoutTool,
    action: 'CHECKED_OUT' | 'RETURNED' | 'DAMAGED',
    runner: (date: string, request: WorkerLoadoutToolActionRequest) => ReturnType<WorkerJobService['checkOutLoadoutTool']>
  ): Promise<void> {
    this.busyKey.set(this.key(tool, action));
    this.error.set('');
    try {
      this.loadout.set(await firstValueFrom(runner(this.selectedDate, {
        workOrderId: tool.workOrderId,
        assetId: tool.assetId
      })));
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to update tool status. Clock in and try again.'));
    } finally {
      this.busyKey.set('');
    }
  }
}
