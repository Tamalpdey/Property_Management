import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import type { SaveWorkerVehicleUseRequest, WorkerDailyLoadout, WorkerLoadoutTool, WorkerLoadoutToolActionRequest } from '@lorne/contracts';
import { WorkerShiftClockService } from '../../core/services/worker-shift-clock.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import { parseDateInput, toDateInput, workerErrorMessage } from '../today/worker-job-ui';
import { VoiceNoteButtonComponent } from '../../shared/voice-note-button.component';

@Component({
  selector: 'lorne-worker-loadout',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, SelectModule, VoiceNoteButtonComponent],
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

      <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Vehicle use</p>
            <h2 class="text-lg font-black text-slate-950">Today’s vehicle and odometer</h2>
            <p class="mt-1 text-xs font-semibold text-slate-500">Optional. Select a fleet vehicle or enter another vehicle.</p>
          </div>
          <button
            pButton
            type="button"
            size="small"
            icon="pi pi-save"
            label="Save vehicle use"
            [loading]="savingVehicle()"
            (click)="saveVehicleUse()"
          ></button>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(12rem,1.35fr)_minmax(10rem,1fr)_9rem_9rem_minmax(12rem,1.4fr)]">
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Fleet vehicle
            <p-select
              styleClass="w-full"
              [options]="loadout()?.vehicles ?? []"
              optionLabel="name"
              optionValue="id"
              [filter]="true"
              filterBy="name,identifier"
              [showClear]="true"
              placeholder="Search vehicles"
              [(ngModel)]="vehicleForm.vehicleAssetId"
              (onChange)="vehicleSelectionChanged()"
            >
              <ng-template pTemplate="item" let-vehicle>
                <div>
                  <div class="font-bold">{{ vehicle.name }}</div>
                  @if (vehicle.identifier) {
                    <div class="text-xs text-slate-500">{{ vehicle.identifier }}</div>
                  }
                </div>
              </ng-template>
            </p-select>
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Other vehicle
            <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Vehicle or plate" [(ngModel)]="vehicleForm.vehicleLabel" [disabled]="!!vehicleForm.vehicleAssetId" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Start km
            <input type="number" min="0" step="0.1" class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="vehicleForm.startKm" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            End km
            <input type="number" min="0" step="0.1" class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" [(ngModel)]="vehicleForm.endKm" />
          </label>
          <label class="grid gap-1 text-sm font-bold text-slate-700">
            Notes
            <input class="h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold" placeholder="Optional notes" [(ngModel)]="vehicleForm.notes" />
          </label>
        </div>
      </section>

      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm">
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
          <div class="flex flex-wrap items-center gap-2">
            <lorne-voice-note-button
              [text]="toolIssueForm.note"
              label="Speak issue note"
              [showUnsupported]="true"
              (textChange)="toolIssueForm.note = $event"
              (error)="error.set($event)"
            />
          </div>

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
  protected readonly savingVehicle = signal(false);
  protected selectedDate = toDateInput(new Date());
  protected search = '';
  protected statusFilter = 'ALL';
  protected toolIssueDialogVisible = false;
  protected selectedIssueTool: WorkerLoadoutTool | null = null;
  protected toolIssueForm = { note: '' };
  protected vehicleForm: SaveWorkerVehicleUseRequest = {};

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
      const loadout = await firstValueFrom(this.workerJobService.loadout(this.selectedDate));
      this.loadout.set(loadout);
      this.vehicleForm = {
        vehicleAssetId: loadout.vehicleUse?.vehicleAssetId,
        vehicleLabel: loadout.vehicleUse?.vehicleLabel,
        startKm: loadout.vehicleUse?.startKm,
        endKm: loadout.vehicleUse?.endKm,
        notes: loadout.vehicleUse?.notes
      };
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load daily loadout. Try again or contact dispatch.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async checkOut(tool: WorkerLoadoutTool): Promise<void> {
    await this.runToolAction(tool, 'CHECKED_OUT', (date, request) => this.workerJobService.checkOutLoadoutTool(date, request));
  }

  protected vehicleSelectionChanged(): void {
    if (this.vehicleForm.vehicleAssetId) {
      this.vehicleForm.vehicleLabel = undefined;
    }
  }

  protected async saveVehicleUse(): Promise<void> {
    if (this.savingVehicle()) {
      return;
    }
    if (this.vehicleForm.startKm != null && this.vehicleForm.endKm != null && this.vehicleForm.endKm < this.vehicleForm.startKm) {
      this.error.set('End km must be the same as or greater than start km.');
      return;
    }
    this.savingVehicle.set(true);
    this.error.set('');
    try {
      const loadout = await firstValueFrom(this.workerJobService.saveVehicleUse(this.selectedDate, this.vehicleForm));
      this.loadout.set(loadout);
      this.vehicleForm = { ...loadout.vehicleUse };
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to save vehicle use. Check the odometer values and try again.'));
    } finally {
      this.savingVehicle.set(false);
    }
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
