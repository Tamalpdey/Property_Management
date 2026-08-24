import { CommonModule } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import type {
  WorkOrderAssignment,
  WorkOrderEvidence,
  WorkOrderFieldOverrideRequest,
  WorkOrderMaterial,
  WorkOrderReview,
  WorkOrderReviewFieldNote,
  WorkOrderRouteStop,
  WorkOrderTask,
  WorkerActivityRecord
} from '@lorne/contracts';

type AssignmentOverrideRow = {
  workerId: string;
  workerName: string;
  workerEmail?: string;
  assignmentStatus: string;
  leadWorker: boolean;
  notes: string;
  actualArrivedAt: string;
  actualWorkStartedAt: string;
  actualFinishedAt: string;
  actualWorkMinutes: number | null;
};

type TaskOverrideRow = {
  taskId: string;
  label: string;
  phase: WorkOrderTask['phase'];
  completed: boolean;
  taskStatus: WorkOrderTask['taskStatus'];
  notes: string;
  completedAt: string;
};

type RouteStopOverrideRow = {
  routeStopId: string;
  deleted: boolean;
  stopType: WorkOrderRouteStop['stopType'];
  name: string;
  address: string;
  instructions: string;
  plannedArrival: string;
  visibleToWorker: boolean;
  label: string;
  arrivedAt: string;
  completedAt: string;
  skippedAt: string;
  skippedReason: string;
};

type MaterialOverrideRow = {
  materialId: string;
  newRow: boolean;
  label: string;
  description: string;
  inventoryItemId?: string;
  used: boolean;
  usedAt: string;
  quantity: number | null;
  unitCost: number | null;
};

type FieldNoteOverrideRow = {
  noteId?: string;
  workerId?: string;
  workerLabel: string;
  note: string;
};

type WorkerActivityOverrideRow = {
  activityId: string;
  workerId: string;
  workerLabel: string;
  deleted: boolean;
  newRow: boolean;
  activityType: string;
  title: string;
  locationName: string;
  address: string;
  notes: string;
  startedAt: string;
  endedAt: string;
};

type OverrideSectionTab = 'WORKERS' | 'ACTIVITY' | 'ROUTES' | 'CHECKLIST' | 'MATERIALS' | 'EVIDENCE' | 'NOTES';

export interface WorkOrderOverrideEvidenceUploadRequest {
  file: File;
  documentType: 'WORK_PHOTO' | 'PURCHASE_RECEIPT';
  photoType?: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER';
  caption?: string;
  receiptAmount?: number;
  vendorName?: string;
}

@Component({
  selector: 'lorne-work-order-field-override',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule
  ],
  template: `
    @if (review(); as data) {
      <div class="flex h-full min-h-[42rem] flex-col overflow-hidden">
      <div class="shrink-0 border-b border-slate-200 bg-white p-3">
      <section class="rounded-lg border border-amber-200 bg-amber-50/80 p-3">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-amber-800">Operations correction</p>
            <h3 class="text-lg font-bold text-slate-950">Override worker field data</h3>
            <p class="mt-1 max-w-4xl text-xs font-semibold leading-5 text-amber-900">
              Use this when dispatch needs to correct field timing, worker status, checklist completion, route stop timing, material usage, or worker notes after the worker app captured the wrong details.
            </p>
          </div>
          <span class="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-amber-800 shadow-sm">
            Audited change
          </span>
        </div>

        <label class="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600" for="override-reason">Reason *</label>
        <textarea
          id="override-reason"
          pTextarea
          rows="1"
          class="mt-1 w-full"
          [(ngModel)]="reason"
          placeholder="Example: Worker forgot to end work before leaving site; corrected from phone call and GPS route."
        ></textarea>
      </section>

      <nav class="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-1.5 md:grid-cols-4 xl:grid-cols-7">
        @for (tab of sectionTabs; track tab.value) {
          <button
            type="button"
            class="flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-black transition"
            [class.border-teal-500]="sectionTab() === tab.value"
            [class.bg-teal-600]="sectionTab() === tab.value"
            [class.text-white]="sectionTab() === tab.value"
            [class.shadow-sm]="sectionTab() === tab.value"
            [class.border-slate-200]="sectionTab() !== tab.value"
            [class.bg-slate-50]="sectionTab() !== tab.value"
            [class.text-slate-600]="sectionTab() !== tab.value"
            (click)="sectionTab.set(tab.value)"
          >
            <i [class]="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>
        }
      </nav>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4">
      <div class="grid gap-4">
        <section class="rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'WORKERS'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Worker execution</p>
              <h4 class="text-lg font-bold text-slate-950">Assignment status and actual timing</h4>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ assignmentRows().length }} workers</span>
          </div>

          <div class="mt-3 grid gap-3">
            @for (row of assignmentRows(); track row.workerId) {
              <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div class="grid gap-3 xl:grid-cols-[minmax(13rem,1fr)_16rem_auto] xl:items-end">
                  <div class="min-w-0">
                    <p class="font-bold text-slate-950">{{ row.workerName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ row.workerEmail || 'No email' }}</p>
                  </div>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Status
                    <p-select class="mt-1 w-full" [options]="assignmentStatusOptions" [(ngModel)]="row.assignmentStatus" />
                  </label>
                  <label class="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                    <p-checkbox [(ngModel)]="row.leadWorker" [binary]="true" />
                    Lead
                  </label>
                </div>
                <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_8rem]">
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Arrived
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.actualArrivedAt" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Work started
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.actualWorkStartedAt" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Finished
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.actualFinishedAt" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Minutes
                    <p-inputNumber styleClass="mt-1 w-full" inputStyleClass="w-full" [(ngModel)]="row.actualWorkMinutes" [min]="0" [useGrouping]="false" />
                  </label>
                </div>
                <label class="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">
                  Assignment notes
                  <input pInputText class="mt-1 w-full" [(ngModel)]="row.notes" />
                </label>
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No assigned workers.</div>
            }
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'ROUTES'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Routes</p>
              <h4 class="text-lg font-bold text-slate-950">Stop timing and exceptions</h4>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ activeRouteStopCount() }} stops</span>
          </div>

          <div class="mt-3 grid gap-3">
            @for (row of routeStopRows(); track row.routeStopId) {
              <article class="rounded-lg border border-slate-200 bg-slate-50 p-3" [class.opacity-50]="row.deleted">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-bold text-slate-950">{{ row.label }}</p>
                  <button pButton type="button" size="small" severity="danger" [text]="true" icon="pi pi-trash" [label]="row.deleted ? 'Removed' : 'Remove'" (click)="toggleRouteDeleted(row)"></button>
                </div>
                <div class="mt-3 grid gap-3 lg:grid-cols-[10rem_1fr_1fr]">
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Type
                    <p-select class="mt-1 w-full" [options]="routeStopTypeOptions" [(ngModel)]="row.stopType" [disabled]="row.deleted" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Stop name
                    <input pInputText class="mt-1 w-full" [(ngModel)]="row.name" [disabled]="row.deleted" placeholder="Office, supplier, key pickup..." />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Address
                    <input pInputText class="mt-1 w-full" [(ngModel)]="row.address" [disabled]="row.deleted" placeholder="Optional address" />
                  </label>
                </div>
                <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_9rem]">
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Planned
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.plannedArrival" [disabled]="row.deleted" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Arrived
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.arrivedAt" [disabled]="row.deleted" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Completed
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.completedAt" [disabled]="row.deleted" />
                  </label>
                  <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                    Skipped
                    <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.skippedAt" [disabled]="row.deleted" />
                  </label>
                  <label class="flex h-10 items-center gap-2 self-end rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                    <p-checkbox [(ngModel)]="row.visibleToWorker" [binary]="true" [disabled]="row.deleted" />
                    Show
                  </label>
                </div>
                <input pInputText class="mt-3 w-full" [(ngModel)]="row.instructions" [disabled]="row.deleted" placeholder="Route instructions" />
                <input pInputText class="mt-3 w-full" [(ngModel)]="row.skippedReason" [disabled]="row.deleted" placeholder="Skipped reason" />
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No route stops.</div>
            }
          </div>
        </section>
      </div>

      <section class="mt-4 rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'ACTIVITY'">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Worker activity</p>
            <h4 class="text-lg font-bold text-slate-950">Office, supplier, shop, and break time</h4>
            <p class="mt-1 text-sm font-semibold text-slate-500">Use this to correct or add time away from property work that should appear on the day ticket.</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ activeActivityCount() }} rows</span>
        </div>

        <div class="mt-3 grid gap-3">
          @for (row of workerActivityRows(); track row.activityId) {
            <article class="rounded-lg border border-slate-200 bg-slate-50 p-3" [class.opacity-50]="row.deleted">
              <div class="grid gap-3 xl:grid-cols-[minmax(14rem,1fr)_11rem_minmax(16rem,1fr)_auto] xl:items-end">
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Worker
                  <p-select
                    class="mt-1 w-full"
                    [options]="workerOptions()"
                    optionLabel="label"
                    optionValue="value"
                    [(ngModel)]="row.workerId"
                    [disabled]="row.deleted"
                    placeholder="Select worker"
                  />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Type
                  <p-select class="mt-1 w-full" [options]="activityTypeOptions" [(ngModel)]="row.activityType" [disabled]="row.deleted" />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Title
                  <input pInputText class="mt-1 w-full" [(ngModel)]="row.title" [disabled]="row.deleted" placeholder="Office visit, supplier pickup..." />
                </label>
                <button pButton type="button" size="small" severity="danger" [text]="true" icon="pi pi-trash" [label]="row.deleted ? 'Removed' : 'Remove'" (click)="toggleActivityDeleted(row)"></button>
              </div>
              <div class="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Started
                  <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.startedAt" [disabled]="row.deleted" />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Ended
                  <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.endedAt" [disabled]="row.deleted" />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Location
                  <input pInputText class="mt-1 w-full" [(ngModel)]="row.locationName" [disabled]="row.deleted" placeholder="Office, supplier, shop..." />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Address
                  <input pInputText class="mt-1 w-full" [(ngModel)]="row.address" [disabled]="row.deleted" placeholder="Optional address" />
                </label>
              </div>
              <label class="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-600">
                Activity notes
                <input pInputText class="mt-1 w-full" [(ngModel)]="row.notes" [disabled]="row.deleted" placeholder="Reason, reference, or correction note" />
              </label>
            </article>
          } @empty {
            <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No worker activity rows for this work-order day.</div>
          }
        </div>
      </section>

      <div class="mt-4 grid gap-4">
        <section class="rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'CHECKLIST'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Checklists</p>
              <h4 class="text-lg font-bold text-slate-950">Pre-start and completion rows</h4>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ taskRows().length }} checks</span>
          </div>

          <div class="mt-3 grid gap-3">
            @for (row of taskRows(); track row.taskId) {
              <article class="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(18rem,1fr)_14rem_7rem]">
                <div>
                  <p class="text-xs font-bold uppercase tracking-wide text-teal-700">{{ row.phase === 'PRE_START' ? 'Pre-start' : 'Completion' }}</p>
                  <p class="font-bold text-slate-950">{{ row.label }}</p>
                  <input pInputText class="mt-2 w-full" [(ngModel)]="row.notes" placeholder="Notes" />
                </div>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Status
                  <p-select class="mt-1 w-full" [options]="taskStatusOptions" [(ngModel)]="row.taskStatus" />
                </label>
                <label class="flex items-center gap-2 self-center text-sm font-bold text-slate-700">
                  <p-checkbox [(ngModel)]="row.completed" [binary]="true" />
                  Done
                </label>
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No checklist rows.</div>
            }
          </div>
        </section>

        <section class="rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'MATERIALS'">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Materials</p>
              <h4 class="text-lg font-bold text-slate-950">Usage correction</h4>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ materialRows().length }} lines</span>
          </div>

          <div class="mt-3 grid gap-3">
            @for (row of materialRows(); track row.materialId) {
              <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div class="grid gap-3 xl:grid-cols-[minmax(18rem,1fr)_7rem_10rem_13rem_auto] xl:items-end">
                <div class="min-w-0">
                  @if (row.newRow) {
                    <label class="block text-xs font-bold uppercase tracking-wide text-slate-600">
                      Material description
                      <input class="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800" [(ngModel)]="row.description" placeholder="Example: Chlorine tablets 3 in" />
                    </label>
                  } @else {
                    <p class="font-bold text-slate-950">{{ row.label }}</p>
                    <p class="mt-1 truncate text-xs font-semibold text-slate-500">{{ row.description }}</p>
                  }
                </div>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Qty
                  <p-inputNumber styleClass="mt-1 w-full" inputStyleClass="w-full" [(ngModel)]="row.quantity" [min]="0" [useGrouping]="false" />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Unit cost
                  <p-inputNumber styleClass="mt-1 w-full" inputStyleClass="w-full" [(ngModel)]="row.unitCost" [min]="0" mode="currency" currency="CAD" />
                </label>
                <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                  Used at
                  <input class="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" type="datetime-local" [(ngModel)]="row.usedAt" />
                </label>
                <label class="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm">
                  <p-checkbox [(ngModel)]="row.used" [binary]="true" />
                  Used
                </label>
                </div>
              </article>
            } @empty {
              <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No material lines.</div>
            }
          </div>
        </section>
      </div>

      <section class="mt-4 rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'EVIDENCE'">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Evidence correction</p>
            <h4 class="text-lg font-bold text-slate-950">Add operations evidence</h4>
            <p class="mt-1 text-sm font-semibold text-slate-500">Attach before, after, issue, other photos, or purchase receipts. Every upload is recorded in audit.</p>
          </div>
          <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ data.evidence.length }} files</span>
        </div>

        <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-[9rem_minmax(16rem,1fr)_12rem_8rem_auto] xl:items-end">
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Photo category</span>
              <select class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="overridePhotoType" [(ngModel)]="evidencePhotoType">
                <option value="BEFORE">Before</option>
                <option value="AFTER">After</option>
                <option value="ISSUE">Issue</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label class="block min-w-0">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Caption <span class="text-red-600">*</span></span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="overrideEvidenceCaption" placeholder="Required evidence note" [(ngModel)]="evidenceCaption" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Receipt vendor</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" name="overrideReceiptVendor" placeholder="Optional" [(ngModel)]="receiptVendor" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Amount</span>
              <input class="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700" type="number" min="0" step="0.01" name="overrideReceiptAmount" placeholder="0.00" [(ngModel)]="receiptAmount" />
            </label>
            <div class="flex flex-wrap gap-2 md:col-span-2 xl:col-span-1">
              <input #overridePhotoInput class="hidden" type="file" accept="image/*" (change)="selectEvidenceFile($event, 'WORK_PHOTO')" />
              <input #overrideReceiptInput class="hidden" type="file" accept="image/*,application/pdf" (change)="selectEvidenceFile($event, 'PURCHASE_RECEIPT')" />
              <button pButton type="button" size="small" icon="pi pi-camera" label="Photo" [disabled]="busy() || !evidenceCaption.trim()" (click)="overridePhotoInput.click()"></button>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-receipt" label="Receipt" [disabled]="busy() || !evidenceCaption.trim()" (click)="overrideReceiptInput.click()"></button>
            </div>
          </div>
          @if (localEvidenceError()) {
            <p class="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{{ localEvidenceError() }}</p>
          }
        </div>

        <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          @for (item of data.evidence; track item.documentId + item.createdAt) {
            <article class="grid grid-cols-[4rem_1fr] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <div class="h-16 bg-white">
                @if (isImageEvidence(item) && item.viewUrl) {
                  <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="h-full w-full object-cover" loading="lazy" />
                } @else {
                  <div class="grid h-full place-items-center text-slate-500"><i [class]="evidenceIcon(item)" class="text-lg"></i></div>
                }
              </div>
              <div class="min-w-0 p-2">
                <p class="truncate text-xs font-black uppercase text-teal-700">{{ evidenceLabel(item) }}</p>
                <p class="truncate text-sm font-bold text-slate-950">{{ item.caption || fileName(item.objectKey) }}</p>
                <p class="truncate text-xs font-semibold text-slate-500">{{ item.createdByName || 'Operations' }} · {{ item.createdAt | date:'MMM d, h:mm a' }}</p>
              </div>
            </article>
          } @empty {
            <p class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">No evidence uploaded yet.</p>
          }
        </div>
      </section>

      <section class="mt-4 rounded-lg border border-slate-200 bg-white p-4" [class.hidden]="sectionTab() !== 'NOTES'">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Field notes</p>
            <h4 class="text-lg font-bold text-slate-950">Edit worker notes or add operations note</h4>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-plus" label="Add note" (click)="addFieldNote(data)"></button>
        </div>

        <div class="mt-3 grid gap-3 md:grid-cols-2">
          @for (row of fieldNoteRows(); track row.noteId || $index) {
            <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <label class="text-xs font-bold uppercase tracking-wide text-slate-600">
                Worker
                <p-select
                  class="mt-1 w-full"
                  [options]="workerOptions()"
                  optionLabel="label"
                  optionValue="value"
                  [(ngModel)]="row.workerId"
                  placeholder="Operations note"
                />
              </label>
              <textarea pTextarea rows="3" class="mt-3 w-full" [(ngModel)]="row.note" placeholder="Note"></textarea>
            </article>
          } @empty {
            <div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm font-semibold text-slate-500">No field notes yet.</div>
          }
        </div>
      </section>
      </div>

      <div class="shrink-0 grid gap-3 border-t border-slate-200 bg-white p-4 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] lg:grid-cols-[1fr_auto] lg:items-center">
        <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
          <p class="text-sm font-semibold text-slate-500">Saved corrections update the review data and are recorded in Audit.</p>
          <div class="flex flex-wrap gap-2">
            @if (sectionTab() === 'ACTIVITY') {
              <button pButton type="button" severity="secondary" icon="pi pi-plus" label="Add activity" (click)="addWorkerActivity(data)"></button>
            }
            @if (sectionTab() === 'ROUTES') {
              <button pButton type="button" severity="secondary" icon="pi pi-plus" label="Add route" (click)="addRouteStop()"></button>
            }
            @if (sectionTab() === 'MATERIALS') {
              <button pButton type="button" severity="secondary" icon="pi pi-plus" label="Add material" (click)="addMaterialLine()"></button>
            }
          </div>
        </div>
        <button
          pButton
          type="button"
          icon="pi pi-save"
          label="Save override"
          [disabled]="!canSave() || busy()"
          [loading]="busy()"
          (click)="submit()"
          class="w-full lg:w-auto"
        ></button>
      </div>
      </div>
    }
  `
})
export class WorkOrderFieldOverrideComponent {
  readonly review = input<WorkOrderReview | null>(null);
  readonly busy = input(false);
  readonly initialTab = input<OverrideSectionTab>('WORKERS');
  readonly save = output<WorkOrderFieldOverrideRequest>();
  readonly evidenceUpload = output<WorkOrderOverrideEvidenceUploadRequest>();

  protected reason = '';
  protected evidencePhotoType: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER' = 'AFTER';
  protected evidenceCaption = '';
  protected receiptVendor = '';
  protected receiptAmount: number | null = null;
  protected readonly localEvidenceError = signal('');
  protected readonly assignmentRows = signal<AssignmentOverrideRow[]>([]);
  protected readonly taskRows = signal<TaskOverrideRow[]>([]);
  protected readonly routeStopRows = signal<RouteStopOverrideRow[]>([]);
  protected readonly materialRows = signal<MaterialOverrideRow[]>([]);
  protected readonly fieldNoteRows = signal<FieldNoteOverrideRow[]>([]);
  protected readonly workerActivityRows = signal<WorkerActivityOverrideRow[]>([]);
  protected readonly sectionTab = signal<OverrideSectionTab>('WORKERS');
  protected readonly sectionTabs: Array<{ value: OverrideSectionTab; label: string; icon: string }> = [
    { value: 'WORKERS', label: 'Workers', icon: 'pi pi-users' },
    { value: 'ACTIVITY', label: 'Activity', icon: 'pi pi-clock' },
    { value: 'ROUTES', label: 'Routes', icon: 'pi pi-map' },
    { value: 'CHECKLIST', label: 'Checklist', icon: 'pi pi-list-check' },
    { value: 'MATERIALS', label: 'Materials', icon: 'pi pi-box' },
    { value: 'EVIDENCE', label: 'Evidence', icon: 'pi pi-camera' },
    { value: 'NOTES', label: 'Notes', icon: 'pi pi-pencil' }
  ];

  protected readonly assignmentStatusOptions = [
    'ASSIGNED',
    'ACCEPTED',
    'ON_SITE',
    'IN_PROGRESS',
    'PAUSED',
    'LEFT_EMERGENCY',
    'COMPLETED',
    'RELEASED',
    'DECLINED'
  ];
  protected readonly taskStatusOptions: WorkOrderTask['taskStatus'][] = [
    'TO_DO',
    'IN_PROGRESS',
    'ON_HOLD',
    'PENDING_COMPLETION',
    'COMPLETED',
    'CANCELLED'
  ];
  protected readonly routeStopTypeOptions: WorkOrderRouteStop['stopType'][] = [
    'PICKUP',
    'DELIVERY',
    'RETURN',
    'KEYS',
    'SUPPLIER',
    'WAREHOUSE',
    'OWNER',
    'OTHER'
  ];
  protected readonly activityTypeOptions = ['OFFICE', 'SUPPLIER', 'SHOP', 'WAREHOUSE', 'TRAVEL', 'BREAK', 'OTHER'];
  protected readonly workerOptions = computed(() =>
    this.assignmentRows().map((worker) => ({
      label: `${worker.workerName}${worker.workerEmail ? ` · ${worker.workerEmail}` : ''}`,
      value: worker.workerId
    }))
  );

  constructor() {
    effect(() => this.sectionTab.set(this.initialTab()));
    effect(() => this.hydrate(this.review()));
  }

  protected addFieldNote(review: WorkOrderReview): void {
    const lead = review.workOrder.assignments.find((assignment) => assignment.leadWorker) || review.workOrder.assignments[0];
    this.fieldNoteRows.update((rows) => [
      ...rows,
      {
        workerId: lead?.workerId,
        workerLabel: lead?.workerName || 'Operations note',
        note: ''
      }
    ]);
  }

  protected addRouteStop(): void {
    this.routeStopRows.update((rows) => [
      ...rows,
      {
        routeStopId: `new-${crypto.randomUUID()}`,
        deleted: false,
        stopType: 'PICKUP',
        name: '',
        address: '',
        instructions: '',
        plannedArrival: '',
        visibleToWorker: true,
        label: `${rows.length + 1}. New route stop`,
        arrivedAt: '',
        completedAt: '',
        skippedAt: '',
        skippedReason: ''
      }
    ]);
  }

  protected addMaterialLine(): void {
    this.materialRows.update((rows) => [
      ...rows,
      {
        materialId: `new-${crypto.randomUUID()}`,
        newRow: true,
        label: 'New material',
        description: '',
        used: true,
        usedAt: this.toLocalDateTime(new Date().toISOString()),
        quantity: 1,
        unitCost: 0
      }
    ]);
  }

  protected addWorkerActivity(review: WorkOrderReview): void {
    const lead = review.workOrder.assignments.find((assignment) => assignment.leadWorker) || review.workOrder.assignments[0];
    const start = review.workOrder.scheduledStart || new Date().toISOString();
    this.workerActivityRows.update((rows) => [
      ...rows,
      {
        activityId: `new-${crypto.randomUUID()}`,
        workerId: lead?.workerId || '',
        workerLabel: lead?.workerName || 'Worker',
        deleted: false,
        newRow: true,
        activityType: 'OFFICE',
        title: 'Office visit',
        locationName: '',
        address: '',
        notes: '',
        startedAt: this.toLocalDateTime(start),
        endedAt: ''
      }
    ]);
  }

  protected toggleRouteDeleted(row: RouteStopOverrideRow): void {
    row.deleted = !row.deleted;
  }

  protected toggleActivityDeleted(row: WorkerActivityOverrideRow): void {
    row.deleted = !row.deleted;
  }

  protected activeRouteStopCount(): number {
    return this.routeStopRows().filter((row) => !row.deleted).length;
  }

  protected activeActivityCount(): number {
    return this.workerActivityRows().filter((row) => !row.deleted).length;
  }

  protected canSave(): boolean {
    return Boolean(this.reason.trim());
  }

  protected submit(): void {
    const reason = this.reason.trim();
    if (!reason) {
      return;
    }
    this.save.emit({
      reason,
      assignments: this.assignmentRows().map((row) => ({
        workerId: row.workerId,
        assignmentStatus: row.assignmentStatus,
        leadWorker: row.leadWorker,
        notes: row.notes.trim() || undefined,
        actualArrivedAt: this.fromLocalDateTime(row.actualArrivedAt),
        actualWorkStartedAt: this.fromLocalDateTime(row.actualWorkStartedAt),
        actualFinishedAt: this.fromLocalDateTime(row.actualFinishedAt),
        actualWorkMinutes: row.actualWorkMinutes ?? undefined
      })),
      workerActivities: this.workerActivityRows().map((row) => ({
        activityId: row.newRow ? undefined : row.activityId,
        workerId: row.workerId || undefined,
        delete: row.deleted,
        activityType: row.activityType,
        title: row.title.trim() || undefined,
        locationName: row.locationName.trim() || undefined,
        address: row.address.trim() || undefined,
        notes: row.notes.trim() || undefined,
        startedAt: this.fromLocalDateTime(row.startedAt),
        endedAt: this.fromLocalDateTime(row.endedAt)
      })),
      tasks: this.taskRows().map((row) => ({
        taskId: row.taskId,
        completed: row.completed,
        taskStatus: row.taskStatus,
        notes: row.notes.trim() || undefined,
        completedAt: this.fromLocalDateTime(row.completedAt)
      })),
      routeStops: this.routeStopRows().map((row) => ({
        routeStopId: row.routeStopId.startsWith('new-') ? undefined : row.routeStopId,
        delete: row.deleted,
        stopType: row.stopType,
        name: row.name.trim() || undefined,
        address: row.address.trim() || undefined,
        instructions: row.instructions.trim() || undefined,
        plannedArrival: this.fromLocalDateTime(row.plannedArrival),
        visibleToWorker: row.visibleToWorker,
        arrivedAt: this.fromLocalDateTime(row.arrivedAt),
        completedAt: this.fromLocalDateTime(row.completedAt),
        skippedAt: this.fromLocalDateTime(row.skippedAt),
        skippedReason: row.skippedReason.trim() || undefined
      })),
      materials: this.materialRows().map((row) => ({
        materialId: row.newRow ? undefined : row.materialId,
        description: row.description.trim() || undefined,
        inventoryItemId: row.inventoryItemId,
        used: row.used,
        usedAt: this.fromLocalDateTime(row.usedAt),
        quantity: row.quantity ?? undefined,
        unitCost: row.unitCost ?? undefined
      })),
      fieldNotes: this.fieldNoteRows()
        .filter((row) => row.note.trim())
        .map((row) => ({
          noteId: row.noteId,
          workerId: row.workerId || undefined,
          note: row.note.trim()
        }))
    });
  }

  protected selectEvidenceFile(event: Event, documentType: 'WORK_PHOTO' | 'PURCHASE_RECEIPT'): void {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    inputElement.value = '';
    if (!file) {
      return;
    }
    if (!this.evidenceCaption.trim()) {
      this.localEvidenceError.set('Enter a caption before uploading evidence.');
      return;
    }
    this.localEvidenceError.set('');
    this.evidenceUpload.emit({
      file,
      documentType,
      photoType: documentType === 'WORK_PHOTO' ? this.evidencePhotoType : undefined,
      caption: this.evidenceCaption.trim() || undefined,
      receiptAmount: documentType === 'PURCHASE_RECEIPT' && this.receiptAmount !== null ? this.receiptAmount : undefined,
      vendorName: documentType === 'PURCHASE_RECEIPT' ? this.receiptVendor.trim() || undefined : undefined
    });
    this.evidenceCaption = '';
    this.receiptVendor = '';
    this.receiptAmount = null;
  }

  protected evidenceLabel(item: WorkOrderEvidence): string {
    return item.documentType === 'PURCHASE_RECEIPT'
      ? 'Purchase receipt'
      : `${(item.photoType || 'OTHER').toLowerCase()} photo`;
  }

  protected isImageEvidence(item: WorkOrderEvidence): boolean {
    return Boolean(item.contentType?.startsWith('image/'));
  }

  protected evidenceIcon(item: WorkOrderEvidence): string {
    return item.documentType === 'PURCHASE_RECEIPT' ? 'pi pi-receipt' : 'pi pi-file';
  }

  protected fileName(objectKey: string): string {
    return objectKey.split('/').pop() || objectKey;
  }

  private hydrate(review: WorkOrderReview | null): void {
    if (!review) {
      return;
    }
    this.assignmentRows.set(review.workOrder.assignments.map((assignment) => this.assignmentRow(assignment)));
    this.taskRows.set(review.workOrder.tasks.map((task) => this.taskRow(task)));
    this.routeStopRows.set(review.workOrder.routeStops.map((routeStop) => this.routeStopRow(routeStop)));
    this.materialRows.set(review.workOrder.materials.map((material) => this.materialRow(material)));
    this.fieldNoteRows.set(review.fieldNotes.map((fieldNote) => this.fieldNoteRow(fieldNote)));
    this.workerActivityRows.set((review.workerActivities || []).map((activity) => this.workerActivityRow(activity)));
  }

  private assignmentRow(assignment: WorkOrderAssignment): AssignmentOverrideRow {
    return {
      workerId: assignment.workerId,
      workerName: assignment.workerName,
      workerEmail: assignment.workerEmail,
      assignmentStatus: assignment.assignmentStatus || 'ASSIGNED',
      leadWorker: assignment.leadWorker,
      notes: assignment.notes || '',
      actualArrivedAt: this.toLocalDateTime(assignment.actualArrivedAt),
      actualWorkStartedAt: this.toLocalDateTime(assignment.actualWorkStartedAt),
      actualFinishedAt: this.toLocalDateTime(assignment.actualFinishedAt),
      actualWorkMinutes: assignment.actualWorkMinutes ?? null
    };
  }

  private taskRow(task: WorkOrderTask): TaskOverrideRow {
    return {
      taskId: task.id,
      label: task.label,
      phase: task.phase,
      completed: task.completed,
      taskStatus: task.taskStatus,
      notes: task.notes || '',
      completedAt: ''
    };
  }

  private routeStopRow(routeStop: WorkOrderRouteStop): RouteStopOverrideRow {
    return {
      routeStopId: routeStop.id,
      deleted: false,
      stopType: routeStop.stopType,
      name: routeStop.name,
      address: routeStop.address || '',
      instructions: routeStop.instructions || '',
      plannedArrival: this.toLocalDateTime(routeStop.plannedArrival),
      visibleToWorker: routeStop.visibleToWorker ?? true,
      label: `${routeStop.stopOrder}. ${routeStop.name}`,
      arrivedAt: this.toLocalDateTime(routeStop.arrivedAt),
      completedAt: this.toLocalDateTime(routeStop.completedAt),
      skippedAt: this.toLocalDateTime(routeStop.skippedAt),
      skippedReason: routeStop.skippedReason || ''
    };
  }

  private materialRow(material: WorkOrderMaterial): MaterialOverrideRow {
    return {
      materialId: material.id,
      newRow: false,
      label: material.itemName || material.description,
      description: material.description,
      inventoryItemId: material.inventoryItemId,
      used: material.used,
      usedAt: this.toLocalDateTime(material.usedAt),
      quantity: material.quantity ?? null,
      unitCost: material.unitCost ?? null
    };
  }

  private fieldNoteRow(fieldNote: WorkOrderReviewFieldNote): FieldNoteOverrideRow {
    return {
      noteId: fieldNote.id,
      workerId: fieldNote.workerId,
      workerLabel: fieldNote.workerName,
      note: fieldNote.note
    };
  }

  private workerActivityRow(activity: WorkerActivityRecord): WorkerActivityOverrideRow {
    const assignment = this.assignmentRows().find((row) => row.workerId === activity.workerId);
    return {
      activityId: activity.id,
      workerId: activity.workerId,
      workerLabel: assignment?.workerName || 'Worker',
      deleted: false,
      newRow: false,
      activityType: activity.activityType || 'OTHER',
      title: activity.title || '',
      locationName: activity.locationName || '',
      address: activity.address || '',
      notes: activity.notes || '',
      startedAt: this.toLocalDateTime(activity.startedAt),
      endedAt: this.toLocalDateTime(activity.endedAt)
    };
  }

  private toLocalDateTime(value?: string): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  private fromLocalDateTime(value: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
}
