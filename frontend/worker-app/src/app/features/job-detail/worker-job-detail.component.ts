import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import {
  WorkerAssignedJob,
  WorkerJobAction,
  WorkerJobActionRequest,
  WorkerJobAsset,
  WorkerJobChecklistItem,
  WorkerJobMaterial,
  WorkerFieldNote,
  WorkerStepKey
} from '@lorne/contracts';
import { WorkerActionBarComponent } from '../today/components/worker-action-bar.component';
import { WorkerChecklistComponent } from '../today/components/worker-checklist.component';
import { WorkerStepperComponent } from '../today/components/worker-stepper.component';
import { WorkerActionDraftService } from '../today/services/worker-action-draft.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import {
  WORKER_STEPS,
  canUseChecklist,
  checklistDisabledReason,
  primaryAction,
  primaryActionLabel,
  stepForStatus,
  toDateInput,
  workerErrorMessage
} from '../today/worker-job-ui';

type ChecklistPhase = 'PRE_START' | 'COMPLETION';
type WorkerDetailPanel = 'DISPATCH' | 'TIMELINE' | 'PRE_START_CHECKLIST' | 'COMPLETION_CHECKLIST';

@Component({
  selector: 'lorne-worker-job-detail',
  standalone: true,
  imports: [
    ButtonModule,
    DatePipe,
    DialogModule,
    FormsModule,
    InputNumberModule,
    InputTextModule,
    RouterLink,
    TagModule,
    WorkerActionBarComponent,
    WorkerChecklistComponent,
    WorkerStepperComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl space-y-2 pb-36">
      <div class="flex items-center justify-between gap-2">
        <a routerLink="/today" class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 no-underline">
          <i class="pi pi-arrow-left"></i>
          Jobs
        </a>
        <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }
      @if (job(); as selectedJob) {
        <article class="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-lg shadow-teal-950/10">
          <div class="bg-slate-950 px-4 py-4 text-white sm:px-5">
            <div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-xs font-black uppercase tracking-wide text-teal-200">{{ selectedJob.workOrderNumber }}</span>
                  <span [class]="priorityBadgeClass(selectedJob)">{{ priorityLabel(selectedJob) }}</span>
                  <span [class]="assignmentBadgeClass(selectedJob)">{{ assignmentLabel(selectedJob) }}</span>
                </div>
                <h1 class="mt-2 text-2xl font-black leading-tight sm:text-3xl">{{ selectedJob.propertyName }}</h1>
                <p class="mt-1 text-sm font-bold text-slate-200 sm:text-base">{{ selectedJob.title }}</p>
              </div>
              <div class="flex items-start justify-between gap-3 sm:block sm:text-right">
                <p-tag [value]="statusLabel(selectedJob)" [severity]="statusSeverity(selectedJob)" />
                <p class="mt-2 text-sm font-black text-white">{{ windowLabel(selectedJob) }}</p>
              </div>
            </div>
          </div>
          <div class="grid gap-3 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
            <div class="min-w-0">
              <p class="text-xs font-black uppercase tracking-wide text-slate-500">Service address</p>
              <p class="mt-1 text-sm font-bold leading-6 text-slate-800 sm:text-base">{{ selectedJob.address }}</p>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">{{ selectedJob.serviceName || 'General service' }}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ selectedJob.ownerName }}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ totalCompletedChecks(selectedJob) }}/{{ selectedJob.checklist.length }} checks</span>
              </div>
            </div>
            <a
              class="touch-action inline-flex min-h-12 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 px-4 text-sm font-black text-teal-800 no-underline"
              [href]="directionsUrl(selectedJob)"
              target="_blank"
              rel="noopener"
            >
              <i class="pi pi-directions mr-2"></i>
              Route
            </a>
          </div>
        </article>

        <lorne-worker-stepper [steps]="steps" [currentStep]="stepForStatus(selectedJob)" (stepSelected)="noopStep($event)" />

        @if (message() || isSubmittedForReview(selectedJob)) {
          <section class="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-900 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center">
            <span class="inline-flex items-center gap-2">
              <i class="pi pi-send"></i>
              {{ message() || 'Submitted for operations review.' }}
            </span>
            @if (isSubmittedForReview(selectedJob)) {
              <span class="text-amber-800 sm:text-right">Field actions are locked here. Operations reviews this from the tenant portal.</span>
            }
          </section>
        }

        <section class="rounded-lg border border-teal-100 bg-white p-2 shadow-sm">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            type="button"
            class="touch-action grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
            [class.opacity-60]="!dispatchInstructions(selectedJob)"
            [disabled]="!dispatchInstructions(selectedJob)"
            (click)="openDetailPanel('DISPATCH')"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-teal-50 text-teal-800">
              <i class="pi pi-info-circle"></i>
            </span>
            <span>
              <span class="block text-xs font-black uppercase tracking-wide text-teal-700">Dispatch</span>
              <span class="mt-1 block text-sm font-black leading-tight text-slate-950">{{ dispatchInstructions(selectedJob) ? 'View instructions' : 'No instructions' }}</span>
            </span>
            <i class="pi pi-angle-right text-slate-500"></i>
          </button>
          <button
            type="button"
            class="touch-action grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border bg-slate-50 px-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
            [class.border-teal-200]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0"
            [class.border-amber-200]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0"
            (click)="openDetailPanel('PRE_START_CHECKLIST')"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg" [class.bg-teal-50]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0" [class.text-teal-800]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0" [class.bg-amber-50]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0" [class.text-amber-800]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0">
              <i [class]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0 ? 'pi pi-check-circle' : 'pi pi-list-check'"></i>
            </span>
            <span>
              <span class="block text-xs font-black uppercase tracking-wide text-teal-700">Pre-start</span>
              <span class="mt-1 block text-sm font-black leading-tight text-slate-950">{{ checklistSummary(selectedJob, 'PRE_START') }}</span>
            </span>
            <i class="pi pi-angle-right text-slate-500"></i>
          </button>
          <button
            type="button"
            class="touch-action grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border bg-slate-50 px-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
            [class.border-teal-200]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0"
            [class.border-amber-200]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0"
            (click)="openDetailPanel('COMPLETION_CHECKLIST')"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg" [class.bg-teal-50]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0" [class.text-teal-800]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0" [class.bg-amber-50]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0" [class.text-amber-800]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0">
              <i [class]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0 ? 'pi pi-check-circle' : 'pi pi-flag'"></i>
            </span>
            <span>
              <span class="block text-xs font-black uppercase tracking-wide text-teal-700">Completion</span>
              <span class="mt-1 block text-sm font-black leading-tight text-slate-950">{{ checklistSummary(selectedJob, 'COMPLETION') }}</span>
            </span>
            <i class="pi pi-angle-right text-slate-500"></i>
          </button>
          <button
            type="button"
            class="touch-action grid min-h-16 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40"
            (click)="openDetailPanel('TIMELINE')"
          >
            <span class="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700">
              <i class="pi pi-clock"></i>
            </span>
            <span>
              <span class="block text-xs font-black uppercase tracking-wide text-teal-700">Timeline</span>
              <span class="mt-1 block text-sm font-black leading-tight text-slate-950">{{ selectedJob.executionEvents.length }} timeline events</span>
            </span>
            <i class="pi pi-angle-right text-slate-500"></i>
          </button>
          </div>
        </section>

        <section class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="space-y-3">
            <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials and purchases</p>
                  <h2 class="mt-1 text-xl font-black text-slate-950">Planned and used materials</h2>
                </div>
                @if (!isSubmittedForReview(selectedJob)) {
                  <button pButton type="button" size="small" icon="pi pi-plus" label="Add new used" (click)="openAction('ADD_MATERIAL_USED')"></button>
                }
              </div>
              <div class="mt-3 grid gap-2">
                @for (material of selectedJob.materials; track material.id) {
                  <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center">
                    <span>
                      <span class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-black text-slate-950">{{ material.itemName || material.description || 'Material' }}</span>
                        <span class="rounded-full px-2 py-0.5 text-[0.68rem] font-black uppercase" [class.bg-teal-100]="material.used" [class.text-teal-800]="material.used" [class.bg-amber-100]="!material.used" [class.text-amber-800]="!material.used">
                          {{ material.used ? 'Used' : 'Planned' }}
                        </span>
                      </span>
                      <span class="mt-1 block text-xs font-bold text-slate-500">{{ material.quantity }}{{ material.unit ? ' ' + material.unit : '' }}{{ material.description && material.itemName ? ' · ' + material.description : '' }}</span>
                    </span>
                    @if (!material.used && !isSubmittedForReview(selectedJob)) {
                      <button pButton type="button" size="small" icon="pi pi-check-circle" label="Mark used" (click)="markMaterialUsed(material)"></button>
                    }
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-500">
                    No planned materials. Tap Add new used for anything consumed or purchased during this job.
                  </p>
                }
              </div>
            </section>

            <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Field notes</p>
                  <h2 class="mt-1 text-xl font-black text-slate-950">Worker notes for this job</h2>
                </div>
              </div>
              <div class="mt-3 grid gap-2">
                @for (fieldNote of selectedJob.fieldNotes; track fieldNote.id) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div class="flex items-start justify-between gap-2">
                      <span>
                        <span class="block text-sm font-black text-slate-950">{{ fieldNote.workerName }}</span>
                        <span class="block text-xs font-bold text-slate-500">{{ fieldNote.updatedAt | date:'MMM d, h:mm a' }}</span>
                      </span>
                      @if (fieldNote.canEdit) {
                        <button pButton type="button" size="small" severity="secondary" icon="pi pi-pencil" label="Edit" (click)="editNote(fieldNote)"></button>
                      }
                    </div>
                    <p class="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{{ fieldNote.note }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-500">
                    No field notes yet. Use the Note action below to type or speak a note.
                  </p>
                }
              </div>
            </section>
          </div>

          <aside class="space-y-3">
            <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Evidence and receipts</p>
              <div class="mt-3 grid gap-2">
                <button pButton type="button" severity="secondary" icon="pi pi-camera" label="Before photo" [disabled]="isSubmittedForReview(selectedJob)" (click)="openPhoto('BEFORE')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-camera" label="After photo" [disabled]="isSubmittedForReview(selectedJob)" (click)="openPhoto('AFTER')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-exclamation-circle" label="Issue photo" [disabled]="isSubmittedForReview(selectedJob)" (click)="openPhoto('ISSUE')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-receipt" label="Purchase receipt" [disabled]="isSubmittedForReview(selectedJob)" (click)="openAction('ADD_PURCHASE_RECEIPT')"></button>
              </div>
            </section>

            <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Tools and equipment</p>
                <p-tag [value]="selectedJob.assets.length + ' assigned'" severity="secondary" />
              </div>
              <div class="mt-3 grid gap-2">
                @for (asset of selectedJob.assets; track asset.assetId) {
                  <button type="button" class="touch-action rounded-lg border border-slate-200 bg-slate-50 p-3 text-left" [disabled]="isSubmittedForReview(selectedJob)" (click)="openToolReturn(asset)">
                    <span class="block text-sm font-black text-slate-950">{{ asset.name }}</span>
                    <span class="block text-xs font-bold text-slate-500">{{ asset.assetType }}{{ asset.identifier ? ' · ' + asset.identifier : '' }}</span>
                  </button>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-500">No tools assigned.</p>
                }
              </div>
            </section>
          </aside>
        </section>

        @if (hasWorkerActions(selectedJob)) {
        <div class="sticky bottom-20 z-20 rounded-lg border border-teal-100 bg-white/95 p-3 shadow-xl shadow-teal-900/10 backdrop-blur">
          @if (primaryActionDisabled(selectedJob)) {
            <p class="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-800">{{ primaryDisabledReason(selectedJob) }}</p>
          }
          <lorne-worker-action-bar
            [primaryLabel]="primaryActionLabel(selectedJob)"
            [primaryDisabled]="primaryActionDisabled(selectedJob)"
            [actions]="quickActions(selectedJob)"
            [busy]="savingAction()"
            (primary)="runPrimary(selectedJob)"
            (quick)="openAction($event)"
          />
        </div>
        }
      } @else {
        <div class="rounded-lg border border-teal-100 bg-white p-8 text-center shadow-sm">
          <p class="text-xl font-black text-slate-950">Job not found</p>
          <p class="mt-2 text-sm font-semibold text-slate-600">This work order is not assigned in the loaded worker schedule window.</p>
        </div>
      }

      <p-dialog
        [header]="detailPanelTitle()"
        [modal]="true"
        [visible]="!!detailPanel()"
        [style]="{ width: 'min(34rem, 94vw)' }"
        (visibleChange)="!$event && closeDetailPanel()"
      >
        @if (job(); as selectedJob) {
          @if (detailPanel() === 'DISPATCH') {
            <div class="space-y-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Dispatch instructions</p>
              <p class="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-6 text-slate-700">
                {{ dispatchInstructions(selectedJob) || 'No dispatch instructions were provided for this work order.' }}
              </p>
            </div>
          }

          @if (detailPanel() === 'TIMELINE') {
            <div class="grid gap-2">
              @for (event of selectedJob.executionEvents; track event.action + event.occurredAt) {
                <div class="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <span class="mt-1 grid h-8 w-8 place-items-center rounded-full bg-teal-100 text-teal-800">
                    <i class="pi pi-clock"></i>
                  </span>
                  <span>
                    <span class="block text-sm font-black text-slate-950">{{ event.label }}</span>
                    <span class="block text-xs font-bold text-slate-500">{{ event.occurredAt | date:'MMM d, h:mm a' }}{{ event.workerName ? ' · ' + event.workerName : '' }}</span>
                    @if (event.note) {
                      <span class="mt-1 block text-xs font-semibold leading-5 text-slate-600">{{ event.note }}</span>
                    }
                  </span>
                </div>
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-bold text-slate-500">
                  No timeline activity recorded yet. Open dispatch, review a checklist, or start travel to begin the timeline.
                </p>
              }
            </div>
          }

          @if (detailPanel() === 'PRE_START_CHECKLIST') {
            <lorne-worker-checklist
              [items]="checklistItems(selectedJob, 'PRE_START')"
              eyebrow="Pre-start checks"
              title="Before work starts"
              description="Complete these before starting work on site."
              [busyTaskId]="busyTaskId()"
              [disabled]="!canUseChecklist(selectedJob, 'PRE_START')"
              [disabledReason]="checklistDisabledReason(selectedJob, 'PRE_START')"
              (completeItem)="completeChecklist(selectedJob, $event)"
            />
          }

          @if (detailPanel() === 'COMPLETION_CHECKLIST') {
            <lorne-worker-checklist
              [items]="checklistItems(selectedJob, 'COMPLETION')"
              eyebrow="Completion checks"
              title="Before submitting work"
              description="Complete these after the work is actually done."
              [busyTaskId]="busyTaskId()"
              [disabled]="!canUseChecklist(selectedJob, 'COMPLETION')"
              [disabledReason]="checklistDisabledReason(selectedJob, 'COMPLETION')"
              (completeItem)="completeChecklist(selectedJob, $event)"
            />
          }
        }
      </p-dialog>

      <p-dialog
        [header]="actionTitle()"
        [modal]="true"
        [visible]="!!pendingAction()"
        [style]="{ width: 'min(34rem, 94vw)' }"
        (visibleChange)="!$event && closeAction()"
      >
        <form class="space-y-3" (ngSubmit)="submitAction()">
          @if (pendingAction() === 'ADD_MATERIAL_USED') {
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">
              {{ actionForm.materialId ? 'This marks the planned material as actually used on this work order.' : 'This adds a new unplanned material and marks it used. For field purchases, enter item/store/receipt details here until purchase-order support is added.' }}
            </div>
            @if (actionForm.materialId) {
              <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-black text-teal-800">{{ actionForm.materialDescription }}</p>
            }
            @if (!actionForm.materialId) {
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Used material or purchase detail</span>
              <input pInputText class="w-full" name="materialDescription" required [(ngModel)]="actionForm.materialDescription" (ngModelChange)="saveActionDraft()" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Quantity</span>
              <p-inputNumber name="quantity" [(ngModel)]="actionForm.quantity" (ngModelChange)="saveActionDraft()" [min]="0.01" [step]="0.25" styleClass="w-full" />
            </label>
            }
          }

          @if (pendingAction() === 'RETURN_TOOL') {
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Tool or equipment</span>
              <select class="w-full border border-slate-300 px-3 py-3 text-sm font-semibold" name="assetId" required [(ngModel)]="actionForm.assetId" (ngModelChange)="saveActionDraft()">
                <option value="">Select tool</option>
                @for (asset of dialogAssets(); track asset.assetId) {
                  <option [value]="asset.assetId">{{ asset.name }}{{ asset.identifier ? ' · ' + asset.identifier : '' }}</option>
                }
              </select>
            </label>
          }

          @if (pendingAction() === 'ADD_PHOTO') {
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Photo type</span>
              <select class="w-full border border-slate-300 px-3 py-3 text-sm font-semibold" name="photoType" [(ngModel)]="actionForm.photoType" (ngModelChange)="saveActionDraft()">
                <option value="BEFORE">Before</option>
                <option value="AFTER">After</option>
                <option value="ISSUE">Issue</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label class="grid touch-action place-items-center rounded-lg border border-dashed border-teal-300 bg-teal-50 px-3 py-8 text-center text-sm font-black text-teal-800">
              <i class="pi pi-camera mb-2 text-2xl"></i>
              Capture photo
              <input class="hidden" type="file" accept="image/*" capture="environment" (change)="markPhotoSelected($event)" />
            </label>
          }

          @if (pendingAction() === 'ADD_PURCHASE_RECEIPT') {
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">
              Upload a photo or PDF invoice/receipt for anything purchased for this work order.
            </div>
            <div class="grid gap-2 sm:grid-cols-2">
              <label class="block">
                <span class="mb-1 block text-sm font-bold text-slate-700">Vendor/store</span>
                <input pInputText class="w-full" name="vendorName" [(ngModel)]="actionForm.vendorName" (ngModelChange)="saveActionDraft()" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-bold text-slate-700">Amount</span>
                <p-inputNumber name="receiptAmount" [(ngModel)]="actionForm.receiptAmount" (ngModelChange)="saveActionDraft()" [min]="0" [step]="0.01" mode="decimal" [minFractionDigits]="2" styleClass="w-full" />
              </label>
            </div>
            <label class="grid touch-action place-items-center rounded-lg border border-dashed border-teal-300 bg-teal-50 px-3 py-8 text-center text-sm font-black text-teal-800">
              <i class="pi pi-receipt mb-2 text-2xl"></i>
              Upload receipt or invoice
              <input class="hidden" type="file" accept="image/*,application/pdf" capture="environment" (change)="markReceiptSelected($event)" />
            </label>
          }

          @if (pendingAction() === 'ADD_NOTE' || pendingAction() === 'UPDATE_NOTE' || pendingAction() === 'PAUSE_WORK' || pendingAction() === 'LEAVE_EMERGENCY' || pendingAction() === 'RETURN_TOOL' || pendingAction() === 'ADD_PHOTO' || pendingAction() === 'ADD_PURCHASE_RECEIPT') {
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">{{ pendingAction() === 'ADD_PHOTO' || pendingAction() === 'ADD_PURCHASE_RECEIPT' ? 'Caption' : pendingAction() === 'LEAVE_EMERGENCY' ? 'Emergency reason' : 'Note' }}</span>
              <textarea class="w-full border border-slate-300 px-3 py-2 text-sm" name="note" rows="3" [(ngModel)]="actionForm.note" (ngModelChange)="saveActionDraft()"></textarea>
            </label>
            @if (pendingAction() === 'ADD_NOTE' || pendingAction() === 'UPDATE_NOTE') {
              <button
                pButton
                type="button"
                severity="secondary"
                icon="pi pi-microphone"
                [label]="listening() ? 'Listening...' : 'Speak note'"
                [disabled]="!speechSupported() || listening()"
                (click)="startDictation()"
              ></button>
              @if (!speechSupported()) {
                <p class="text-xs font-bold text-slate-500">Voice dictation is not supported by this browser.</p>
              }
            }
          }

          <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="closeAction()"></button>
            <button pButton type="submit" icon="pi pi-check" label="Save" [loading]="savingAction()"></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class WorkerJobDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workerJobService = inject(WorkerJobService);
  private readonly drafts = inject(WorkerActionDraftService);

  protected readonly jobs = signal<WorkerAssignedJob[]>([]);
  protected readonly loading = signal(false);
  protected readonly savingAction = signal(false);
  protected readonly busyTaskId = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly pendingAction = signal<WorkerJobAction | ''>('');
  protected readonly detailPanel = signal<WorkerDetailPanel | ''>('');
  protected readonly listening = signal(false);
  protected readonly steps = WORKER_STEPS;
  protected actionForm: WorkerJobActionRequest = { action: 'ADD_NOTE', photoType: 'OTHER', quantity: 1 };
  private selectedPhotoFile: File | null = null;
  private dictationBaseNote = '';

  protected readonly job = computed(() => this.jobs().find((candidate) => candidate.id === this.jobId()) ?? null);

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
      const anchor = new Date();
      const from = new Date(anchor);
      from.setDate(anchor.getDate() - 30);
      const to = new Date(anchor);
      to.setDate(anchor.getDate() + 60);
      const jobs = await firstValueFrom(this.workerJobService.jobs(toDateInput(from), toDateInput(to)));
      this.jobs.set(jobs);
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to load job detail. Check backend status and worker profile mapping.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected stepForStatus(job: WorkerAssignedJob): WorkerStepKey {
    return stepForStatus(job.status);
  }

  protected primaryActionLabel(job: WorkerAssignedJob): string {
    return primaryActionLabel(job);
  }

  protected canUseChecklist(job: WorkerAssignedJob, phase: ChecklistPhase): boolean {
    return canUseChecklist(job, phase);
  }

  protected checklistDisabledReason(job: WorkerAssignedJob, phase: ChecklistPhase): string {
    return checklistDisabledReason(job, phase);
  }

  protected windowLabel(job: WorkerAssignedJob): string {
    if (!job.scheduledStart) {
      return 'Unscheduled';
    }
    const start = new Date(job.scheduledStart);
    const end = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${end ? ` - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  }

  protected directionsUrl(job: WorkerAssignedJob): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;
  }

  protected statusLabel(job: WorkerAssignedJob): string {
    return job.status === 'PENDING_COMPLETION'
      ? 'submitted for review'
      : job.status.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(job: WorkerAssignedJob): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (job.status) {
      case 'COMPLETED':
      case 'APPROVED':
      case 'PAID':
        return 'success';
      case 'IN_PROGRESS':
      case 'ON_SITE':
      case 'TRAVELING':
        return 'info';
      case 'PAUSED':
      case 'ON_HOLD':
      case 'PENDING_COMPLETION':
        return 'warn';
      case 'CANCELLED':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  protected priorityLabel(job: WorkerAssignedJob): string {
    return job.priority.toUpperCase().replaceAll('_', ' ');
  }

  protected priorityBadgeClass(job: WorkerAssignedJob): string {
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-black uppercase leading-none';
    switch (job.priority.toUpperCase()) {
      case 'URGENT':
      case 'EMERGENCY':
        return `${base} border-red-200 bg-red-50 text-red-700`;
      case 'HIGH':
        return `${base} border-amber-200 bg-amber-50 text-amber-700`;
      case 'LOW':
        return `${base} border-slate-200 bg-slate-100 text-slate-700`;
      default:
        return `${base} border-emerald-200 bg-emerald-50 text-emerald-700`;
    }
  }

  protected assignmentLabel(job: WorkerAssignedJob): string {
    return job.leadWorker ? 'LEAD' : 'ASSIGNED';
  }

  protected assignmentBadgeClass(job: WorkerAssignedJob): string {
    const base = 'inline-flex items-center rounded-full border px-2.5 py-1 text-[0.7rem] font-black uppercase leading-none';
    return job.leadWorker
      ? `${base} border-sky-200 bg-sky-50 text-sky-700`
      : `${base} border-indigo-200 bg-indigo-50 text-indigo-700`;
  }

  protected dispatchInstructions(job: WorkerAssignedJob): string {
    return job.notes?.trim() ?? '';
  }

  protected openDetailPanel(panel: WorkerDetailPanel): void {
    this.detailPanel.set(panel);
    void this.recordPanelView(panel);
  }

  protected closeDetailPanel(): void {
    this.detailPanel.set('');
  }

  protected detailPanelTitle(): string {
    switch (this.detailPanel()) {
      case 'TIMELINE':
        return 'Execution timeline';
      case 'PRE_START_CHECKLIST':
        return 'Pre-start checklist';
      case 'COMPLETION_CHECKLIST':
        return 'Completion checklist';
      default:
        return 'Dispatch instructions';
    }
  }

  protected checklistItems(job: WorkerAssignedJob, phase: ChecklistPhase): WorkerJobChecklistItem[] {
    return job.checklist.filter((item) => item.phase === phase);
  }

  protected completedChecks(job: WorkerAssignedJob, phase: ChecklistPhase): number {
    return this.checklistItems(job, phase).filter((item) => item.completed).length;
  }

  protected totalCompletedChecks(job: WorkerAssignedJob): number {
    return job.checklist.filter((item) => item.completed).length;
  }

  protected checklistSummary(job: WorkerAssignedJob, phase: ChecklistPhase): string {
    const total = this.checklistItems(job, phase).length;
    if (total === 0) {
      return 'No checks';
    }
    const remaining = this.requiredChecksRemaining(job, phase);
    return remaining === 0
      ? `${total}/${total} complete`
      : `${remaining} required left`;
  }

  protected isSubmittedForReview(job: WorkerAssignedJob): boolean {
    return ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'PAID'].includes(job.status);
  }

  protected hasWorkerActions(job: WorkerAssignedJob): boolean {
    return Boolean(primaryAction(job.status)) || this.quickActions(job).length > 0;
  }

  protected quickActions(job: WorkerAssignedJob): Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction }> {
    if (this.isSubmittedForReview(job)) {
      return [];
    }
    const actions: Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction }> = [
      { label: 'Note', icon: 'pi pi-pencil', severity: 'secondary', action: 'ADD_NOTE' },
      { label: 'Photo', icon: 'pi pi-camera', severity: 'secondary', action: 'ADD_PHOTO' }
    ];
    if (job.status === 'IN_PROGRESS') {
      actions.unshift({ label: 'Pause', icon: 'pi pi-pause', severity: 'warn', action: 'PAUSE_WORK' });
    }
    if (!['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CANCELLED'].includes(job.status)) {
      actions.push({ label: 'Emergency', icon: 'pi pi-exclamation-triangle', severity: 'danger', action: 'LEAVE_EMERGENCY' });
    }
    return actions.slice(0, 4);
  }

  protected async runPrimary(job: WorkerAssignedJob): Promise<void> {
    if (this.primaryActionDisabled(job)) {
      this.error.set(this.primaryDisabledReason(job));
      this.openDetailPanel(primaryAction(job.status) === 'START_WORK' ? 'PRE_START_CHECKLIST' : 'COMPLETION_CHECKLIST');
      return;
    }
    const action = primaryAction(job.status);
    if (!action) {
      return;
    }
    if (action === 'PAUSE_WORK') {
      this.openAction(action);
      return;
    }
    await this.runAction(job, { action });
  }

  protected openPhoto(photoType: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER'): void {
    this.openAction('ADD_PHOTO');
    this.actionForm.photoType = photoType;
  }

  protected markMaterialUsed(material: WorkerJobMaterial): void {
    this.openAction('ADD_MATERIAL_USED');
    this.actionForm.materialId = material.id;
    this.actionForm.materialDescription = material.itemName || material.description || 'Material';
    this.actionForm.quantity = material.quantity;
  }

  protected openToolReturn(asset: WorkerJobAsset): void {
    this.openAction('RETURN_TOOL');
    this.actionForm.assetId = asset.assetId;
  }

  protected editNote(fieldNote: WorkerFieldNote): void {
    this.openAction('UPDATE_NOTE');
    this.actionForm.noteId = fieldNote.id;
    this.actionForm.note = fieldNote.note;
  }

  protected openAction(action: WorkerJobAction): void {
    const selectedJob = this.job();
    const draft = selectedJob ? this.drafts.read(selectedJob.id, action) : null;
    this.pendingAction.set(action);
    this.actionForm = draft ?? { action, photoType: 'OTHER', quantity: 1 };
    if (draft) {
      this.message.set('Restored unsaved field action draft.');
    }
  }

  protected primaryActionDisabled(job: WorkerAssignedJob): boolean {
    const action = primaryAction(job.status);
    if (action === 'START_WORK') {
      return this.requiredChecksRemaining(job, 'PRE_START') > 0;
    }
    return action === 'COMPLETE_WORK' && this.requiredChecksRemaining(job, 'COMPLETION') > 0;
  }

  protected primaryDisabledReason(job: WorkerAssignedJob): string {
    const action = primaryAction(job.status);
    const phase: ChecklistPhase = action === 'START_WORK' ? 'PRE_START' : 'COMPLETION';
    const remaining = this.requiredChecksRemaining(job, phase);
    if (remaining === 0) {
      return '';
    }
    return phase === 'PRE_START'
      ? `${remaining} required pre-start check${remaining === 1 ? '' : 's'} must be marked done before starting work.`
      : `${remaining} required completion check${remaining === 1 ? '' : 's'} must be marked done before submitting this work order.`;
  }

  protected closeAction(): void {
    this.pendingAction.set('');
    this.actionForm = { action: 'ADD_NOTE', photoType: 'OTHER', quantity: 1 };
    this.selectedPhotoFile = null;
    this.dictationBaseNote = '';
  }

  protected async submitAction(): Promise<void> {
    const selectedJob = this.job();
    const action = this.pendingAction();
    if (!selectedJob || !action || this.savingAction()) {
      return;
    }
    const validation = this.validateAction(action);
    if (validation) {
      this.error.set(validation);
      return;
    }
    const saved = action === 'ADD_PHOTO' || action === 'ADD_PURCHASE_RECEIPT'
      ? await this.uploadAndRecordDocument(selectedJob, action)
      : await this.runAction(selectedJob, { ...this.actionForm, action });
    if (saved) {
      this.drafts.clear(selectedJob.id, action);
      this.closeAction();
    }
  }

  protected async completeChecklist(job: WorkerAssignedJob, item: WorkerJobChecklistItem): Promise<void> {
    if (this.busyTaskId() || !canUseChecklist(job, item.phase)) {
      return;
    }
    this.busyTaskId.set(item.id);
    try {
      await this.runAction(job, { action: 'COMPLETE_CHECKLIST', taskId: item.id });
    } finally {
      this.busyTaskId.set('');
    }
  }

  protected markPhotoSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (file) {
      this.selectedPhotoFile = file;
      this.actionForm.note = this.actionForm.note || file.name;
      this.saveActionDraft();
    }
  }

  protected markReceiptSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (file) {
      this.selectedPhotoFile = file;
      this.actionForm.note = this.actionForm.note || file.name;
      this.saveActionDraft();
    }
  }

  protected saveActionDraft(): void {
    const selectedJob = this.job();
    const action = this.pendingAction();
    if (!selectedJob || !action) {
      return;
    }
    this.drafts.write(selectedJob.id, action, { ...this.actionForm, action });
  }

  protected actionTitle(): string {
    switch (this.pendingAction()) {
      case 'ADD_NOTE':
        return 'Add field note';
      case 'UPDATE_NOTE':
        return 'Update field note';
      case 'ADD_PHOTO':
        return 'Capture photo';
      case 'ADD_MATERIAL_USED':
        return 'Record material or purchase';
      case 'ADD_PURCHASE_RECEIPT':
        return 'Upload purchase receipt';
      case 'RETURN_TOOL':
        return 'Return tool';
      case 'PAUSE_WORK':
        return 'Pause work';
      case 'LEAVE_EMERGENCY':
        return 'Emergency leave';
      default:
        return 'Worker action';
    }
  }

  protected dialogAssets(): WorkerJobAsset[] {
    return this.job()?.assets ?? [];
  }

  protected noopStep(_step: WorkerStepKey): void {
  }

  private async recordPanelView(panel: WorkerDetailPanel): Promise<void> {
    const selectedJob = this.job();
    if (!selectedJob) {
      return;
    }
    const action = viewAction(panel);
    try {
      await firstValueFrom(this.workerJobService.action(selectedJob.id, await this.withActionMetadata({ action })));
    } catch {
      // View auditing should never block field navigation.
    }
  }

  protected speechSupported(): boolean {
    const browserWindow = window as unknown as SpeechRecognitionWindow;
    return Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition);
  }

  protected startDictation(): void {
    const browserWindow = window as unknown as SpeechRecognitionWindow;
    const SpeechRecognitionConstructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor || this.listening()) {
      return;
    }
    const recognition = new SpeechRecognitionConstructor();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    this.dictationBaseNote = this.actionForm.note?.trim() ?? '';
    recognition.onstart = () => this.listening.set(true);
    recognition.onend = () => this.listening.set(false);
    recognition.onerror = () => {
      this.listening.set(false);
      this.error.set('Voice dictation stopped. You can type the note manually.');
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = finalTranscript(event);
      if (!transcript) {
        return;
      }
      this.actionForm.note = appendDictation(this.dictationBaseNote, transcript);
      this.saveActionDraft();
    };
    recognition.start();
  }

  private async runAction(job: WorkerAssignedJob, request: WorkerJobActionRequest): Promise<boolean> {
    if (this.savingAction()) {
      return false;
    }
    this.savingAction.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const response = await firstValueFrom(this.workerJobService.action(job.id, await this.withActionMetadata(request)));
      this.jobs.update((jobs) => jobs.map((candidate) => candidate.id === response.job.id ? response.job : candidate));
      this.message.set(response.message);
      return true;
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Unable to save worker action. Please try again or contact dispatch.'));
      return false;
    } finally {
      this.savingAction.set(false);
    }
  }

  private async uploadAndRecordDocument(job: WorkerAssignedJob, action: WorkerJobAction): Promise<boolean> {
    if (!this.selectedPhotoFile) {
      this.error.set(action === 'ADD_PURCHASE_RECEIPT' ? 'Upload a receipt or invoice before saving.' : 'Capture or choose a photo before saving.');
      return false;
    }
    if (this.savingAction()) {
      return false;
    }
    this.savingAction.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const photoType = this.actionForm.photoType ?? 'OTHER';
      const upload = await firstValueFrom(this.workerJobService.photoUploadUrl(job.id, {
        fileName: this.selectedPhotoFile.name || 'photo.jpg',
        contentType: this.selectedPhotoFile.type || 'image/jpeg',
        byteSize: this.selectedPhotoFile.size,
        photoType,
        documentType: action === 'ADD_PURCHASE_RECEIPT' ? 'PURCHASE_RECEIPT' : 'WORK_PHOTO'
      }));
      await firstValueFrom(this.workerJobService.uploadPhoto(upload, this.selectedPhotoFile));
      const response = await firstValueFrom(this.workerJobService.action(job.id, await this.withActionMetadata({
        action,
        documentId: upload.documentId,
        photoType,
        caption: this.actionForm.note,
        vendorName: this.actionForm.vendorName,
        receiptAmount: this.actionForm.receiptAmount
      })));
      this.jobs.update((jobs) => jobs.map((candidate) => candidate.id === response.job.id ? response.job : candidate));
      this.message.set(action === 'ADD_PURCHASE_RECEIPT' ? 'Purchase receipt uploaded to R2 and recorded.' : 'Photo uploaded to R2 and recorded.');
      return true;
    } catch (error) {
      this.error.set(workerErrorMessage(error, action === 'ADD_PURCHASE_RECEIPT' ? 'Unable to upload receipt. Check connection and try again.' : 'Unable to upload photo. Check connection and try again.'));
      return false;
    } finally {
      this.savingAction.set(false);
    }
  }

  private validateAction(action: WorkerJobAction): string {
    if (action === 'ADD_MATERIAL_USED') {
      if (this.actionForm.materialId) {
        return '';
      }
      if (!this.actionForm.materialDescription?.trim()) {
        return 'Enter the material used or purchase detail before saving.';
      }
      if (!this.actionForm.quantity || this.actionForm.quantity <= 0) {
        return 'Enter a quantity greater than zero.';
      }
    }
    if (action === 'RETURN_TOOL' && !this.actionForm.assetId) {
      return 'Select the tool or equipment being returned.';
    }
    if ((action === 'ADD_NOTE' || action === 'UPDATE_NOTE') && !this.actionForm.note?.trim()) {
      return 'Enter or speak a note before saving.';
    }
    if (action === 'LEAVE_EMERGENCY' && !this.actionForm.note?.trim()) {
      return 'Enter the emergency leave reason before saving.';
    }
    if (action === 'UPDATE_NOTE' && !this.actionForm.noteId) {
      return 'Select a field note to update.';
    }
    if (action === 'ADD_PHOTO' && !this.selectedPhotoFile) {
      return 'Capture or choose a photo before saving.';
    }
    if (action === 'ADD_PURCHASE_RECEIPT' && !this.selectedPhotoFile) {
      return 'Upload a receipt or invoice before saving.';
    }
    return '';
  }

  protected requiredChecksRemaining(job: WorkerAssignedJob, phase: ChecklistPhase): number {
    return this.checklistItems(job, phase).filter((item) => item.required && !item.completed).length;
  }

  private async withActionMetadata(request: WorkerJobActionRequest): Promise<WorkerJobActionRequest> {
    const metadata: WorkerJobActionRequest = {
      ...request,
      deviceTimestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      platform: userAgentPlatform()
    };
    const position = await currentPosition();
    if (!position) {
      return metadata;
    }
    return {
      ...metadata,
      latitude: Number(position.coords.latitude.toFixed(7)),
      longitude: Number(position.coords.longitude.toFixed(7)),
      locationAccuracyMeters: Math.round(position.coords.accuracy)
    };
  }

  private jobId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }
}

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript?: string }> {
  isFinal?: boolean;
}

function finalTranscript(event: SpeechRecognitionEventLike): string {
  const results = event.results;
  if (!results?.length) {
    return '';
  }
  const start = event.resultIndex ?? 0;
  const transcripts: string[] = [];
  for (let index = start; index < results.length; index++) {
    const result = results[index];
    if (result && result.isFinal !== false) {
      const transcript = result[0]?.transcript?.trim();
      if (transcript) {
        transcripts.push(transcript);
      }
    }
  }
  return transcripts.join(' ').trim();
}

function appendDictation(baseNote: string, transcript: string): string {
  return baseNote ? `${baseNote}\n${transcript}` : transcript;
}

function viewAction(panel: WorkerDetailPanel): WorkerJobAction {
  switch (panel) {
    case 'TIMELINE':
      return 'VIEW_TIMELINE';
    case 'PRE_START_CHECKLIST':
      return 'VIEW_PRE_START_CHECKLIST';
    case 'COMPLETION_CHECKLIST':
      return 'VIEW_COMPLETION_CHECKLIST';
    default:
      return 'VIEW_DISPATCH';
  }
}

function userAgentPlatform(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || navigator.platform || 'unknown';
}

function currentPosition(): Promise<GeolocationPosition | null> {
  if (!navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (position: GeolocationPosition | null) => {
      if (!settled) {
        settled = true;
        resolve(position);
      }
    };
    const timeout = window.setTimeout(() => done(null), 1500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeout);
        done(position);
      },
      () => {
        window.clearTimeout(timeout);
        done(null);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 1200 }
    );
  });
}
