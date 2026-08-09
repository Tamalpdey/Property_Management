import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  WorkerJobEvidence,
  WorkerJobMaterial,
  WorkerFieldNote,
  WorkerStepKey
} from '@lorne/contracts';
import { WorkerActionBarComponent } from '../today/components/worker-action-bar.component';
import { WorkerChecklistComponent } from '../today/components/worker-checklist.component';
import { WorkerStepperComponent } from '../today/components/worker-stepper.component';
import { WorkerShiftClockService } from '../../core/services/worker-shift-clock.service';
import { WorkerActionDraftService } from '../today/services/worker-action-draft.service';
import { WorkerJobService } from '../today/services/worker-job.service';
import {
  WORKER_STEPS,
  canUseChecklist,
  checklistDisabledReason,
  isWorkerAssignmentClosed,
  isFutureJob,
  primaryAction,
  primaryActionLabel,
  stepForStatus,
  toDateInput,
  workerFacingStatus,
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
    NgTemplateOutlet,
    TagModule,
    WorkerActionBarComponent,
    WorkerChecklistComponent,
    WorkerStepperComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl space-y-2 pb-24 sm:pb-32">
      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{{ error() }}</p>
      }
      @if (job(); as selectedJob) {
        <article class="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-lg shadow-teal-950/10">
          <div class="bg-slate-950 px-3 py-2.5 text-white sm:px-5 sm:py-3">
            <div class="grid gap-2">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-xs font-black uppercase tracking-wide text-teal-200">{{ selectedJob.workOrderNumber }}</span>
                  <span [class]="priorityBadgeClass(selectedJob)">{{ priorityLabel(selectedJob) }}</span>
                  <span [class]="assignmentBadgeClass(selectedJob)">{{ assignmentLabel(selectedJob) }}</span>
                  <button
                    pButton
                    type="button"
                    severity="secondary"
                    size="small"
                    icon="pi pi-refresh"
                    [rounded]="true"
                    [text]="true"
                    [loading]="loading()"
                    aria-label="Refresh job"
                    class="!ml-auto !h-7 !w-7 !text-white"
                    (click)="load()"
                  ></button>
                </div>
                <h1 class="mt-1.5 text-[1.55rem] font-black leading-none sm:text-3xl">{{ selectedJob.propertyName }}</h1>
                <p class="mt-1 text-sm font-bold text-slate-200 sm:text-base">{{ selectedJob.title }}</p>
              </div>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
              <p-tag [value]="statusLabel(selectedJob)" [severity]="statusSeverity(selectedJob)" />
              @if (showOverallStatus(selectedJob)) {
                <span class="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[0.68rem] font-black uppercase text-slate-200">
                  Order: {{ overallStatusLabel(selectedJob) }}
                </span>
              }
              <p class="ml-auto min-w-0 text-sm font-black leading-tight text-white">{{ windowLabel(selectedJob) }}</p>
              <p class="text-right text-xs font-black leading-tight text-slate-300">{{ scheduleDateLabel(selectedJob) }}</p>
            </div>
            <div class="mt-2 flex flex-wrap gap-2">
              <span class="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-white">
                <i class="pi pi-stopwatch mr-1 text-teal-200"></i>
                Shift {{ shiftTimerLabel() }}
              </span>
              <span class="rounded-lg border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-white">
                <i class="pi pi-clock mr-1 text-teal-200"></i>
                Task {{ taskTimerLabel(selectedJob) }}
              </span>
            </div>
          </div>
          <div class="px-3 py-2.5 sm:px-5">
            <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div class="min-w-0">
                <p class="text-xs font-black uppercase tracking-wide text-slate-500">Service address</p>
                <p class="mt-1 text-sm font-bold leading-5 text-slate-800 sm:text-base">{{ selectedJob.address }}</p>
              </div>
              <a
                class="touch-action inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 text-teal-800 no-underline"
                [href]="directionsUrl(selectedJob)"
                target="_blank"
                rel="noopener"
                aria-label="Open route"
              >
                <i class="pi pi-directions text-sm"></i>
              </a>
            </div>
            <div class="min-w-0">
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="rounded-full bg-teal-50 px-3 py-1 text-xs font-black text-teal-800">{{ selectedJob.serviceName || 'General service' }}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ selectedJob.ownerName }}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{{ totalCompletedChecks(selectedJob) }}/{{ selectedJob.checklist.length }} checks</span>
              </div>
            </div>
          </div>
        </article>

        <lorne-worker-stepper [steps]="steps" [currentStep]="stepForStatus(selectedJob)" (stepSelected)="noopStep($event)" />

        @if (message() || showWorkerReviewBanner(selectedJob)) {
          <section class="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-900 shadow-sm sm:grid-cols-[auto_1fr] sm:items-center">
            <span class="inline-flex items-center gap-2">
              <i class="pi pi-send"></i>
              {{ message() || workerReviewBannerTitle(selectedJob) }}
            </span>
            @if (showWorkerReviewBanner(selectedJob)) {
              <span class="text-amber-800 sm:text-right">{{ workerReviewBannerDetail(selectedJob) }}</span>
            }
          </section>
        }

        <section class="rounded-lg border border-teal-100 bg-white p-1 shadow-sm">
          <div class="worker-detail-grid">
            <button
              type="button"
              class="worker-detail-chip"
              [class.opacity-60]="!dispatchInstructions(selectedJob)"
              [disabled]="!dispatchInstructions(selectedJob)"
              (click)="openDetailPanel('DISPATCH')"
            >
              <span class="worker-detail-chip__icon bg-teal-50 text-teal-800">
                <i class="pi pi-info-circle"></i>
              </span>
              <span class="min-w-0">
                <span class="worker-detail-chip__eyebrow">Dispatch</span>
                <span class="worker-detail-chip__value">{{ dispatchInstructions(selectedJob) ? 'View' : 'None' }}</span>
              </span>
            </button>
            <button
              type="button"
              class="worker-detail-chip"
              [class.worker-detail-chip--done]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0"
              [class.worker-detail-chip--attention]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0"
              (click)="openDetailPanel('PRE_START_CHECKLIST')"
            >
              <span class="worker-detail-chip__icon" [class.bg-teal-50]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0" [class.text-teal-800]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0" [class.bg-amber-50]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0" [class.text-amber-800]="requiredChecksRemaining(selectedJob, 'PRE_START') > 0">
                <i [class]="requiredChecksRemaining(selectedJob, 'PRE_START') === 0 ? 'pi pi-check-circle' : 'pi pi-list-check'"></i>
              </span>
              <span class="min-w-0">
                <span class="worker-detail-chip__eyebrow">Pre-start</span>
                <span class="worker-detail-chip__value">{{ shortChecklistSummary(selectedJob, 'PRE_START') }}</span>
              </span>
            </button>
            <button
              type="button"
              class="worker-detail-chip"
              [class.worker-detail-chip--done]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0"
              [class.worker-detail-chip--attention]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0"
              (click)="openDetailPanel('COMPLETION_CHECKLIST')"
            >
              <span class="worker-detail-chip__icon" [class.bg-teal-50]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0" [class.text-teal-800]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0" [class.bg-amber-50]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0" [class.text-amber-800]="requiredChecksRemaining(selectedJob, 'COMPLETION') > 0">
                <i [class]="requiredChecksRemaining(selectedJob, 'COMPLETION') === 0 ? 'pi pi-check-circle' : 'pi pi-flag'"></i>
              </span>
              <span class="min-w-0">
                <span class="worker-detail-chip__eyebrow">Done</span>
                <span class="worker-detail-chip__value">{{ shortChecklistSummary(selectedJob, 'COMPLETION') }}</span>
              </span>
            </button>
            <button
              type="button"
              class="worker-detail-chip"
              (click)="openDetailPanel('TIMELINE')"
            >
              <span class="worker-detail-chip__icon bg-slate-100 text-slate-700">
                <i class="pi pi-clock"></i>
              </span>
              <span class="min-w-0">
                <span class="worker-detail-chip__eyebrow">Timeline</span>
                <span class="worker-detail-chip__value">{{ selectedJob.executionEvents.length }} events</span>
              </span>
            </button>
          </div>
        </section>

        <section class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="space-y-3">
            <section class="rounded-lg border border-teal-100 bg-white p-3 shadow-sm sm:p-4">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div class="min-w-0">
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials and purchases</p>
                  <h2 class="mt-1 text-lg font-black leading-tight text-slate-950 sm:text-xl">Planned and used materials</h2>
                </div>
                @if (canModifyFieldWork(selectedJob)) {
                  <button
                    type="button"
                    class="worker-section-action"
                    aria-label="Add used material"
                    (click)="openAction('ADD_MATERIAL_USED')"
                  >
                    <i class="pi pi-plus"></i>
                    <span>Add used</span>
                  </button>
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
                    @if (!material.used && canModifyFieldWork(selectedJob)) {
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
              @if (isFutureJob(selectedJob)) {
                <p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-800">Evidence unlocks on the service date.</p>
              }
              <div class="mt-3 grid gap-2">
                <button pButton type="button" severity="secondary" icon="pi pi-camera" label="Before photo" [disabled]="!canAddEvidence(selectedJob)" (click)="openPhoto('BEFORE')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-camera" label="After photo" [disabled]="!canAddEvidence(selectedJob)" (click)="openPhoto('AFTER')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-exclamation-circle" label="Issue photo" [disabled]="!canAddEvidence(selectedJob)" (click)="openPhoto('ISSUE')"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-receipt" label="Purchase receipt" [disabled]="!canAddEvidence(selectedJob)" (click)="openAction('ADD_PURCHASE_RECEIPT')"></button>
              </div>
            </section>

            <section class="rounded-lg border border-teal-100 bg-white p-4 shadow-sm">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Tools and equipment</p>
                <p-tag [value]="selectedJob.assets.length + ' assigned'" severity="secondary" />
              </div>
              <div class="mt-3 grid gap-2">
                @for (asset of selectedJob.assets; track asset.assetId) {
                  <button type="button" class="touch-action rounded-lg border border-slate-200 bg-slate-50 p-3 text-left" [disabled]="!canModifyFieldWork(selectedJob)" (click)="openToolReturn(asset)">
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
        <div class="sticky bottom-14 z-20 rounded-lg border border-teal-100 bg-white/95 p-2 shadow-xl shadow-teal-900/10 backdrop-blur sm:bottom-20 sm:p-3">
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
              Capture or choose photos
              @if (job(); as selectedJob) {
                <span class="mt-1 text-xs font-bold text-teal-700">{{ evidenceSlotsAvailable(selectedJob) }} of {{ maxEvidencePerGroup }} slots available for this photo type.</span>
                <input class="hidden" type="file" accept="image/*" capture="environment" multiple [disabled]="evidenceLimitReached(selectedJob)" (change)="markPhotoSelected($event)" />
              }
            </label>
            @if (job(); as selectedJob) {
              <ng-container *ngTemplateOutlet="uploadedEvidenceGrid; context: { job: selectedJob }" />
            }
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
              Upload receipts or invoices
              @if (job(); as selectedJob) {
                <span class="mt-1 text-xs font-bold text-teal-700">{{ evidenceSlotsAvailable(selectedJob) }} of {{ maxEvidencePerGroup }} slots available. Images and PDFs are supported.</span>
                <input class="hidden" type="file" accept="image/*,application/pdf" multiple [disabled]="evidenceLimitReached(selectedJob)" (change)="markReceiptSelected($event)" />
              }
            </label>
            @if (job(); as selectedJob) {
              <ng-container *ngTemplateOutlet="uploadedEvidenceGrid; context: { job: selectedJob }" />
            }
          }

          @if ((pendingAction() === 'ADD_PHOTO' || pendingAction() === 'ADD_PURCHASE_RECEIPT') && selectedUploadFiles().length > 0) {
            <div class="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              <p class="px-1 text-xs font-black uppercase tracking-wide text-slate-500">Selected files</p>
              @for (file of selectedUploadFiles(); track file.name + file.size + $index) {
                <div class="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-black text-slate-950">{{ file.name }}</span>
                    <span class="block text-xs font-bold text-slate-500">{{ fileSizeLabel(file.size) }}</span>
                  </span>
                  <button pButton type="button" size="small" severity="danger" icon="pi pi-trash" [text]="true" (click)="removeSelectedUpload($index)"></button>
                </div>
              }
            </div>
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

      <ng-template #uploadedEvidenceGrid let-selectedJob="job">
        <section class="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div class="mb-2 flex items-center justify-between gap-2">
            <span class="text-xs font-black uppercase tracking-wide text-slate-500">{{ uploadEvidenceHeading() }}</span>
            <span class="rounded-full bg-white px-2 py-1 text-[0.68rem] font-black text-slate-600">
              {{ filteredJobEvidence(selectedJob).length }}/{{ maxEvidencePerGroup }}
            </span>
          </div>
          <div class="grid grid-cols-4 gap-2">
            @for (item of filteredJobEvidence(selectedJob); track item.documentId) {
              <div class="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <button type="button" class="aspect-square w-full" (click)="openWorkerEvidence(item)">
                  @if (isImageEvidence(item) && item.viewUrl) {
                    <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="h-full w-full object-cover" loading="lazy" />
                  } @else {
                    <span class="grid h-full place-items-center text-slate-500">
                      <i [class]="evidenceIcon(item)" class="text-xl"></i>
                    </span>
                  }
                </button>
                <span class="block truncate bg-white px-2 py-1 text-[0.68rem] font-black text-slate-700">{{ evidenceLabel(item) }}</span>
                @if (item.canDelete && canAddEvidence(selectedJob)) {
                  <button
                    pButton
                    type="button"
                    size="small"
                    severity="danger"
                    icon="pi pi-trash"
                    class="!absolute !right-1 !top-1 !h-7 !w-7"
                    [rounded]="true"
                    [disabled]="savingAction()"
                    (click)="deleteEvidence(selectedJob, item, $event)"
                  ></button>
                }
              </div>
            } @empty {
              <p class="col-span-4 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-xs font-bold text-slate-500">
                No uploaded files for this group yet.
              </p>
            }
          </div>
        </section>
      </ng-template>

      <p-dialog
        header="Evidence preview"
        [modal]="true"
        [visible]="!!workerEvidencePreview()"
        [style]="{ width: 'min(34rem, 94vw)' }"
        (visibleChange)="!$event && closeWorkerEvidence()"
      >
        @if (workerEvidencePreview(); as item) {
          <section class="space-y-3">
            <div class="overflow-hidden rounded-lg bg-slate-950">
              @if (isImageEvidence(item) && item.viewUrl) {
                <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="max-h-[70vh] w-full object-contain" />
              } @else if (item.viewUrl) {
                <div class="grid min-h-72 place-items-center p-6 text-center text-white">
                  <span>
                    <i [class]="evidenceIcon(item)" class="text-5xl"></i>
                    <span class="mt-3 block text-lg font-black">{{ evidenceLabel(item) }}</span>
                    <a [href]="item.viewUrl" target="_blank" rel="noopener" class="mt-4 inline-flex rounded-lg bg-white px-4 py-3 text-sm font-black text-slate-950 no-underline">Open file</a>
                  </span>
                </div>
              }
            </div>
            <p class="text-sm font-black text-slate-950">{{ item.caption || evidenceLabel(item) }}</p>
          </section>
        }
      </p-dialog>
    </section>
  `,
  styles: [`
    .worker-detail-grid {
      display: grid;
      gap: 0.3rem;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .worker-detail-chip {
      align-items: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 0.55rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      justify-content: center;
      min-height: 4rem;
      min-width: 0;
      padding: 0.38rem 0.2rem;
      text-align: center;
      transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
    }

    .worker-detail-chip:active:not(:disabled) {
      transform: scale(0.985);
    }

    .worker-detail-chip:disabled {
      cursor: not-allowed;
    }

    .worker-detail-chip--done {
      border-color: #99f6e4;
    }

    .worker-detail-chip--attention {
      border-color: #facc15;
    }

    .worker-detail-chip__icon {
      border-radius: 999px;
      display: grid;
      font-size: 0.8rem;
      height: 1.65rem;
      place-items: center;
      width: 1.65rem;
    }

    .worker-detail-chip__eyebrow {
      color: #0f766e;
      display: block;
      font-size: 0.58rem;
      font-weight: 900;
      letter-spacing: 0.03em;
      line-height: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .worker-detail-chip__value {
      color: #020617;
      display: block;
      font-size: 0.74rem;
      font-weight: 900;
      line-height: 1.1;
      margin-top: 0.15rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .worker-section-action {
      align-items: center;
      background: #10b981;
      border: 0;
      border-radius: 0.65rem;
      color: #ffffff;
      display: inline-flex;
      font-size: 0.78rem;
      font-weight: 900;
      gap: 0.35rem;
      min-height: 2.35rem;
      padding: 0 0.7rem;
      white-space: nowrap;
    }

    .worker-section-action:active {
      transform: scale(0.985);
    }
  `]
})
export class WorkerJobDetailComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly workerJobService = inject(WorkerJobService);
  private readonly drafts = inject(WorkerActionDraftService);
  private readonly shiftClock = inject(WorkerShiftClockService);

  protected readonly jobs = signal<WorkerAssignedJob[]>([]);
  protected readonly loading = signal(false);
  protected readonly savingAction = signal(false);
  protected readonly busyTaskId = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly pendingAction = signal<WorkerJobAction | ''>('');
  protected readonly detailPanel = signal<WorkerDetailPanel | ''>('');
  protected readonly listening = signal(false);
  protected readonly workerEvidencePreview = signal<WorkerJobEvidence | null>(null);
  protected readonly now = signal(Date.now());
  protected readonly maxEvidencePerGroup = 15;
  protected readonly steps = WORKER_STEPS;
  protected actionForm: WorkerJobActionRequest = { action: 'ADD_NOTE', photoType: 'OTHER', quantity: 1 };
  private readonly selectedPhotoFiles = signal<File[]>([]);
  private readonly timerHandle = window.setInterval(() => this.now.set(Date.now()), 30000);
  private dictationBaseNote = '';

  protected readonly job = computed(() => this.jobs().find((candidate) => candidate.id === this.jobId()) ?? null);

  constructor() {
    void this.load();
  }

  ngOnDestroy(): void {
    window.clearInterval(this.timerHandle);
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
    const status = workerFacingStatus(job);
    if ((status === 'IN_PROGRESS' || status === 'PAUSED') && this.requiredChecksRemaining(job, 'COMPLETION') === 0) {
      return 'photos';
    }
    return stepForStatus(workerFacingStatus(job));
  }

  protected primaryActionLabel(job: WorkerAssignedJob): string {
    if (isWorkerAssignmentClosed(job)) {
      return job.assignmentStatus === 'COMPLETED' ? 'Submitted' : 'Closed';
    }
    const action = this.primaryActionForWorker(job);
    if (!action) {
      return primaryActionLabel(job);
    }
    if (action === 'COMPLETE_WORK' && !this.hasAfterPhoto(job)) {
      return 'Add after photo';
    }
    return this.primaryActionLabelForAction(action);
  }

  protected canUseChecklist(job: WorkerAssignedJob, phase: ChecklistPhase): boolean {
    if (isWorkerAssignmentClosed(job)) {
      return false;
    }
    return canUseChecklist(this.effectiveWorkerJob(job), phase);
  }

  protected checklistDisabledReason(job: WorkerAssignedJob, phase: ChecklistPhase): string {
    if (isWorkerAssignmentClosed(job)) {
      return 'Your assignment for this work order is already closed.';
    }
    return checklistDisabledReason(this.effectiveWorkerJob(job), phase);
  }

  protected windowLabel(job: WorkerAssignedJob): string {
    if (!job.scheduledStart) {
      return 'Unscheduled';
    }
    const start = new Date(job.scheduledStart);
    const end = job.scheduledEnd ? new Date(job.scheduledEnd) : null;
    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}${end ? ` - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  }

  protected scheduleDateLabel(job: WorkerAssignedJob): string {
    if (!job.scheduledStart) {
      return 'No service date';
    }
    return new Date(job.scheduledStart).toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  protected shiftTimerLabel(): string {
    const state = this.shiftClock.state();
    if (!state.clockedIn || !state.startedAt) {
      return 'not clocked in';
    }
    return durationLabel(new Date(state.startedAt).getTime(), this.now());
  }

  protected taskTimerLabel(job: WorkerAssignedJob): string {
    return taskDurationLabel(job, this.now());
  }

  protected directionsUrl(job: WorkerAssignedJob): string {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;
  }

  protected statusLabel(job: WorkerAssignedJob): string {
    const status = workerFacingStatus(job);
    return status === 'PENDING_COMPLETION'
      ? 'submitted for review'
      : status.toLowerCase().replaceAll('_', ' ');
  }

  protected showOverallStatus(job: WorkerAssignedJob): boolean {
    return workerFacingStatus(job) !== job.status;
  }

  protected overallStatusLabel(job: WorkerAssignedJob): string {
    return job.status.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(job: WorkerAssignedJob): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' {
    switch (workerFacingStatus(job)) {
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

  protected shortChecklistSummary(job: WorkerAssignedJob, phase: ChecklistPhase): string {
    const total = this.checklistItems(job, phase).length;
    if (total === 0) {
      return 'No checks';
    }
    const remaining = this.requiredChecksRemaining(job, phase);
    return remaining === 0 ? 'Done' : `${remaining} left`;
  }

  protected isSubmittedForReview(job: WorkerAssignedJob): boolean {
    return isWorkerAssignmentClosed(job) || ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(job.status);
  }

  protected showWorkerReviewBanner(job: WorkerAssignedJob): boolean {
    return isWorkerAssignmentClosed(job) || ['PENDING_COMPLETION', 'COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID'].includes(job.status);
  }

  protected workerReviewBannerTitle(job: WorkerAssignedJob): string {
    return isWorkerAssignmentClosed(job)
      ? 'Your work is submitted for operations review.'
      : 'Team review is pending.';
  }

  protected workerReviewBannerDetail(job: WorkerAssignedJob): string {
    if (!isWorkerAssignmentClosed(job) && ['PENDING_COMPLETION', 'COMPLETED'].includes(job.status)) {
      return 'Another worker has submitted work. Finish your assignment so operations can complete the review.';
    }
    return this.canAddEvidence(job)
      ? 'Workflow actions are locked. You can still add photos or purchase receipts.'
      : 'Field actions are locked here. Operations reviews this from the tenant portal.';
  }

  protected isFutureJob(job: WorkerAssignedJob): boolean {
    return isFutureJob(job);
  }

  protected canModifyFieldWork(job: WorkerAssignedJob): boolean {
    return !isFutureJob(job)
      && !isWorkerAssignmentClosed(job)
      && !['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(job.status);
  }

  protected canAddEvidence(job: WorkerAssignedJob): boolean {
    if (isFutureJob(job)) {
      return false;
    }
    return !['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(job.status);
  }

  protected hasWorkerActions(job: WorkerAssignedJob): boolean {
    return Boolean(this.primaryActionForWorker(job)) || this.quickActions(job).length > 0;
  }

  protected quickActions(job: WorkerAssignedJob): Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction }> {
    if (isFutureJob(job)) {
      return [];
    }
    if (isWorkerAssignmentClosed(job)) {
      if (!this.canAddEvidence(job)) {
        return [];
      }
      return [
        { label: 'Photo', icon: 'pi pi-camera', severity: 'secondary', action: 'ADD_PHOTO' },
        { label: 'Receipt', icon: 'pi pi-receipt', severity: 'secondary', action: 'ADD_PURCHASE_RECEIPT' }
      ];
    }
    const workerStatus = workerFacingStatus(job);
    if (['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(workerStatus)) {
      return [];
    }
    const actions: Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction }> = [
      { label: 'Note', icon: 'pi pi-pencil', severity: 'secondary', action: 'ADD_NOTE' },
      { label: 'Photo', icon: 'pi pi-camera', severity: 'secondary', action: 'ADD_PHOTO' }
    ];
    if (workerStatus === 'IN_PROGRESS') {
      actions.unshift({ label: 'Pause', icon: 'pi pi-pause', severity: 'warn', action: 'PAUSE_WORK' });
    }
    if (!['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(workerStatus)) {
      actions.push({ label: 'Emergency', icon: 'pi pi-exclamation-triangle', severity: 'danger', action: 'LEAVE_EMERGENCY' });
    }
    return actions.slice(0, 4);
  }

  protected async runPrimary(job: WorkerAssignedJob): Promise<void> {
    if (this.primaryActionDisabled(job)) {
      this.error.set(this.primaryDisabledReason(job));
      if (isFutureJob(job)) {
        return;
      }
      this.openDetailPanel(this.primaryActionForWorker(job) === 'START_WORK' ? 'PRE_START_CHECKLIST' : 'COMPLETION_CHECKLIST');
      return;
    }
    const action = this.primaryActionForWorker(job);
    if (!action) {
      return;
    }
    if (action === 'PAUSE_WORK') {
      this.openAction(action);
      return;
    }
    if (action === 'COMPLETE_WORK' && !this.hasAfterPhoto(job)) {
      this.message.set('Add an after photo before submitting this job.');
      this.openPhoto('AFTER');
      return;
    }
    await this.runAction(job, { action });
  }

  protected openPhoto(photoType: 'BEFORE' | 'AFTER' | 'ISSUE' | 'OTHER'): void {
    const selectedJob = this.job();
    if (selectedJob && !this.actionAllowed(selectedJob, 'ADD_PHOTO')) {
      this.error.set(this.actionDisabledReason(selectedJob, 'ADD_PHOTO'));
      return;
    }
    this.openAction('ADD_PHOTO');
    this.actionForm.photoType = photoType;
  }

  protected markMaterialUsed(material: WorkerJobMaterial): void {
    const selectedJob = this.job();
    if (selectedJob && !this.actionAllowed(selectedJob, 'ADD_MATERIAL_USED')) {
      this.error.set(this.actionDisabledReason(selectedJob, 'ADD_MATERIAL_USED'));
      return;
    }
    this.openAction('ADD_MATERIAL_USED');
    this.actionForm.materialId = material.id;
    this.actionForm.materialDescription = material.itemName || material.description || 'Material';
    this.actionForm.quantity = material.quantity;
  }

  protected openToolReturn(asset: WorkerJobAsset): void {
    const selectedJob = this.job();
    if (selectedJob && !this.actionAllowed(selectedJob, 'RETURN_TOOL')) {
      this.error.set(this.actionDisabledReason(selectedJob, 'RETURN_TOOL'));
      return;
    }
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
    if (selectedJob && !this.actionAllowed(selectedJob, action)) {
      this.error.set(this.actionDisabledReason(selectedJob, action));
      return;
    }
    const draft = selectedJob ? this.drafts.read(selectedJob.id, action) : null;
    this.pendingAction.set(action);
    this.actionForm = draft ?? { action, photoType: 'OTHER', quantity: 1 };
    if (draft) {
      this.message.set('Restored unsaved field action draft.');
    }
  }

  protected primaryActionDisabled(job: WorkerAssignedJob): boolean {
    const action = this.primaryActionForWorker(job);
    if (isFutureJob(job)) {
      return true;
    }
    if (isWorkerAssignmentClosed(job)) {
      return true;
    }
    if (action === 'START_WORK') {
      return this.requiredChecksRemaining(job, 'PRE_START') > 0;
    }
    return action === 'COMPLETE_WORK' && this.requiredChecksRemaining(job, 'COMPLETION') > 0;
  }

  protected primaryDisabledReason(job: WorkerAssignedJob): string {
    if (isFutureJob(job)) {
      return 'This job is scheduled for a future date. Field actions unlock on the service date.';
    }
    if (isWorkerAssignmentClosed(job)) {
      return 'Your assignment for this work order is already closed.';
    }
    const action = this.primaryActionForWorker(job);
    const phase: ChecklistPhase = action === 'START_WORK' ? 'PRE_START' : 'COMPLETION';
    const remaining = this.requiredChecksRemaining(job, phase);
    if (remaining === 0) {
      if (action === 'COMPLETE_WORK' && !this.hasAfterPhoto(job)) {
        return 'Add at least one after photo before submitting this work order.';
      }
      return '';
    }
    return phase === 'PRE_START'
      ? `${remaining} required pre-start check${remaining === 1 ? '' : 's'} must be marked done before starting work.`
      : `${remaining} required completion check${remaining === 1 ? '' : 's'} must be marked done before submitting this work order.`;
  }

  private actionAllowed(job: WorkerAssignedJob, action: WorkerJobAction): boolean {
    if (isFutureJob(job)) {
      return false;
    }
    if (action === 'ADD_PHOTO' || action === 'ADD_PURCHASE_RECEIPT') {
      return this.canAddEvidence(job);
    }
    if (isWorkerAssignmentClosed(job)) {
      return false;
    }
    return this.canModifyFieldWork(job);
  }

  private actionDisabledReason(job: WorkerAssignedJob, action: WorkerJobAction): string {
    if (isFutureJob(job)) {
      return 'This job is scheduled for a future date. You can view it now, but field actions unlock on the service date.';
    }
    if ((action === 'ADD_PHOTO' || action === 'ADD_PURCHASE_RECEIPT') && !this.canAddEvidence(job)) {
      return 'Evidence can only be added before operations closes the work order.';
    }
    if (isWorkerAssignmentClosed(job)) {
      return 'Your assignment is already submitted. Only photos and purchase receipts can still be added before operations closes the work order.';
    }
    return 'This worker action is not available for the current job status.';
  }

  private effectiveWorkerJob(job: WorkerAssignedJob): WorkerAssignedJob {
    return { ...job, status: workerFacingStatus(job) };
  }

  private primaryActionForWorker(job: WorkerAssignedJob): WorkerJobAction | null {
    if (isWorkerAssignmentClosed(job)) {
      return null;
    }
    return primaryAction(workerFacingStatus(job));
  }

  private primaryActionLabelForAction(action: WorkerJobAction): string {
    switch (action) {
      case 'START_TRAVEL':
        return 'Start travel';
      case 'ARRIVE_ON_SITE':
        return 'Arrived';
      case 'START_WORK':
        return 'Start work';
      case 'COMPLETE_WORK':
        return 'Complete work';
      case 'RESUME_WORK':
        return 'Resume work';
      default:
        return 'Continue';
    }
  }

  protected closeAction(): void {
    this.pendingAction.set('');
    this.actionForm = { action: 'ADD_NOTE', photoType: 'OTHER', quantity: 1 };
    this.selectedPhotoFiles.set([]);
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
    if (this.busyTaskId() || !this.canUseChecklist(job, item.phase)) {
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
    const files = Array.from(input?.files ?? []);
    this.addSelectedUploadFiles(files, 'photo');
    if (input) {
      input.value = '';
    }
  }

  protected markReceiptSelected(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const files = Array.from(input?.files ?? []);
    this.addSelectedUploadFiles(files, 'receipt');
    if (input) {
      input.value = '';
    }
  }

  protected selectedUploadFiles(): File[] {
    return this.selectedPhotoFiles();
  }

  protected removeSelectedUpload(index: number): void {
    this.selectedPhotoFiles.update((files) => files.filter((_, candidateIndex) => candidateIndex !== index));
  }

  private addSelectedUploadFiles(files: File[], label: 'photo' | 'receipt'): void {
    if (files.length === 0) {
      return;
    }
    const selectedJob = this.job();
    if (!selectedJob) {
      return;
    }
    const available = this.evidenceSlotsAvailable(selectedJob);
    if (available <= 0) {
      this.error.set(`This ${label} group already has ${this.maxEvidencePerGroup} uploaded files. Delete one before adding another.`);
      return;
    }
    const accepted = files.slice(0, available);
    this.selectedPhotoFiles.update((current) => [...current, ...accepted]);
    this.actionForm.note = this.actionForm.note || accepted[0]?.name;
    this.saveActionDraft();
    if (accepted.length < files.length) {
      this.error.set(`Only ${accepted.length} ${label}${accepted.length === 1 ? '' : 's'} were added because this group is limited to ${this.maxEvidencePerGroup}.`);
    } else {
      this.error.set('');
    }
  }

  protected fileSizeLabel(size: number | undefined): string {
    if (!size) {
      return 'Size unknown';
    }
    if (size < 1024 * 1024) {
      return `${Math.ceil(size / 1024)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  protected evidenceLabel(item: WorkerJobEvidence): string {
    if (item.documentType === 'PURCHASE_RECEIPT') {
      return 'Purchase receipt';
    }
    return `${(item.photoType || 'OTHER').toLowerCase()} photo`;
  }

  protected jobEvidence(job: WorkerAssignedJob): WorkerJobEvidence[] {
    return job.evidence ?? [];
  }

  protected filteredJobEvidence(job: WorkerAssignedJob): WorkerJobEvidence[] {
    const evidence = this.jobEvidence(job);
    if (this.pendingAction() === 'ADD_PURCHASE_RECEIPT') {
      return evidence.filter((item) => item.documentType === 'PURCHASE_RECEIPT');
    }
    if (this.pendingAction() === 'ADD_PHOTO') {
      const photoType = this.actionForm.photoType ?? 'OTHER';
      return evidence.filter((item) => item.documentType === 'WORK_PHOTO' && item.photoType === photoType);
    }
    return evidence;
  }

  protected uploadEvidenceHeading(): string {
    if (this.pendingAction() === 'ADD_PURCHASE_RECEIPT') {
      return 'Uploaded receipts';
    }
    const photoType = this.actionForm.photoType ?? 'OTHER';
    return `Uploaded ${photoType.toLowerCase()} photos`;
  }

  protected evidenceSlotsAvailable(job: WorkerAssignedJob): number {
    return Math.max(0, this.maxEvidencePerGroup - this.filteredJobEvidence(job).length - this.selectedPhotoFiles().length);
  }

  protected evidenceLimitReached(job: WorkerAssignedJob): boolean {
    return this.evidenceSlotsAvailable(job) <= 0;
  }

  protected isImageEvidence(item: WorkerJobEvidence): boolean {
    return Boolean(item.contentType?.startsWith('image/'));
  }

  protected evidenceIcon(item: WorkerJobEvidence): string {
    return item.documentType === 'PURCHASE_RECEIPT' ? 'pi pi-receipt' : 'pi pi-file';
  }

  protected openWorkerEvidence(item: WorkerJobEvidence): void {
    this.workerEvidencePreview.set(item);
  }

  protected closeWorkerEvidence(): void {
    this.workerEvidencePreview.set(null);
  }

  protected async deleteEvidence(job: WorkerAssignedJob, item: WorkerJobEvidence, event?: Event): Promise<void> {
    event?.stopPropagation();
    if (this.savingAction()) {
      return;
    }
    if (!window.confirm(`Delete ${this.evidenceLabel(item)}?`)) {
      return;
    }
    this.savingAction.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const response = await firstValueFrom(this.workerJobService.deleteEvidence(job.id, item.documentId));
      this.jobs.update((jobs) => jobs.map((candidate) => candidate.id === response.job.id ? response.job : candidate));
      this.message.set(response.message);
    } catch (error) {
      this.error.set(workerErrorMessage(error, 'Evidence could not be deleted. Try again or contact dispatch.'));
    } finally {
      this.savingAction.set(false);
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
    const files = this.selectedPhotoFiles();
    if (files.length === 0) {
      this.error.set(action === 'ADD_PURCHASE_RECEIPT' ? 'Upload at least one receipt or invoice before saving.' : 'Capture or choose at least one photo before saving.');
      return false;
    }
    const available = this.maxEvidencePerGroup - this.filteredJobEvidence(job).length;
    if (files.length > available) {
      this.error.set(`Only ${Math.max(0, available)} more ${action === 'ADD_PURCHASE_RECEIPT' ? 'receipt' : 'photo'}${available === 1 ? '' : 's'} can be uploaded for this group.`);
      return false;
    }
    if (this.savingAction()) {
      return false;
    }
    this.savingAction.set(true);
    this.error.set('');
    this.message.set('');
    let uploadedCount = 0;
    try {
      const photoType = this.actionForm.photoType ?? 'OTHER';
      let latestJob = job;
      for (const file of files) {
        const upload = await firstValueFrom(this.workerJobService.photoUploadUrl(job.id, {
          fileName: file.name || (action === 'ADD_PURCHASE_RECEIPT' ? 'receipt.jpg' : 'photo.jpg'),
          contentType: file.type || 'image/jpeg',
          byteSize: file.size,
          photoType,
          documentType: action === 'ADD_PURCHASE_RECEIPT' ? 'PURCHASE_RECEIPT' : 'WORK_PHOTO'
        }));
        await firstValueFrom(this.workerJobService.uploadPhoto(upload, file));
        const response = await firstValueFrom(this.workerJobService.action(job.id, await this.withActionMetadata({
          action,
          documentId: upload.documentId,
          photoType,
          caption: this.actionForm.note || file.name,
          vendorName: this.actionForm.vendorName,
          receiptAmount: this.actionForm.receiptAmount
        })));
        latestJob = response.job;
        uploadedCount += 1;
      }
      this.jobs.update((jobs) => jobs.map((candidate) => candidate.id === latestJob.id ? latestJob : candidate));
      this.message.set(action === 'ADD_PURCHASE_RECEIPT'
        ? `${uploadedCount} receipt${uploadedCount === 1 ? '' : 's'} uploaded to R2 and recorded.`
        : `${uploadedCount} photo${uploadedCount === 1 ? '' : 's'} uploaded to R2 and recorded.`);
      return true;
    } catch (error) {
      this.error.set(workerErrorMessage(
        error,
        uploadedCount > 0
          ? `${uploadedCount} file${uploadedCount === 1 ? '' : 's'} uploaded, but another file failed. Check your connection and try the remaining file again.`
          : action === 'ADD_PURCHASE_RECEIPT'
          ? 'Receipt could not be uploaded. Check your connection and try again. If it keeps happening, contact dispatch.'
          : 'Photo could not be uploaded. Check your connection and try again. If it keeps happening, contact dispatch.'
      ));
      return false;
    } finally {
      this.savingAction.set(false);
    }
  }

  private validateAction(action: WorkerJobAction): string {
    const selectedJob = this.job();
    if (selectedJob && !this.actionAllowed(selectedJob, action)) {
      return this.actionDisabledReason(selectedJob, action);
    }
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
    if (action === 'ADD_PHOTO' && this.selectedPhotoFiles().length === 0) {
      return 'Capture or choose at least one photo before saving.';
    }
    if (action === 'ADD_PURCHASE_RECEIPT' && this.selectedPhotoFiles().length === 0) {
      return 'Upload at least one receipt or invoice before saving.';
    }
    return '';
  }

  protected requiredChecksRemaining(job: WorkerAssignedJob, phase: ChecklistPhase): number {
    return this.checklistItems(job, phase).filter((item) => item.required && !item.completed).length;
  }

  protected hasAfterPhoto(job: WorkerAssignedJob): boolean {
    return this.jobEvidence(job).some((item) => item.documentType === 'WORK_PHOTO' && item.photoType === 'AFTER');
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

function taskDurationLabel(job: WorkerAssignedJob, now: number): string {
  switch (workerFacingStatus(job)) {
    case 'TRAVELING':
      return activeEventDuration(job, now, ['WORKER_START_TRAVEL'], 'travel pending');
    case 'ON_SITE':
      return activeEventDuration(job, now, ['WORKER_ARRIVE_ON_SITE'], 'on-site pending');
    case 'IN_PROGRESS':
      return activeEventDuration(job, now, ['WORKER_RESUME_WORK', 'WORKER_START_WORK'], 'work pending');
    case 'PAUSED':
      return activeEventDuration(job, now, ['WORKER_PAUSE_WORK'], 'paused');
    case 'PENDING_COMPLETION':
    case 'COMPLETED':
    case 'APPROVED':
    case 'CUSTOMER_NOTIFIED':
    case 'INVOICED':
    case 'PAID':
      return totalWorkDuration(job) || 'complete';
    default:
      return 'not started';
  }
}

function activeEventDuration(job: WorkerAssignedJob, now: number, actions: string[], fallback: string): string {
  const event = latestEvent(job, actions);
  return event ? durationLabel(new Date(event.occurredAt).getTime(), now) : fallback;
}

function totalWorkDuration(job: WorkerAssignedJob): string {
  const events = [...job.executionEvents].sort((left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime());
  let startedAt = 0;
  let totalMs = 0;
  for (const event of events) {
    const occurredAt = new Date(event.occurredAt).getTime();
    if ((event.action === 'WORKER_START_WORK' || event.action === 'WORKER_RESUME_WORK') && !startedAt) {
      startedAt = occurredAt;
    }
    if (startedAt && ['WORKER_PAUSE_WORK', 'WORKER_COMPLETE_WORK', 'WORKER_LEFT_EMERGENCY'].includes(event.action)) {
      totalMs += Math.max(0, occurredAt - startedAt);
      startedAt = 0;
    }
  }
  return totalMs > 0 ? compactDuration(totalMs) : '';
}

function latestEvent(job: WorkerAssignedJob, actions: string[]) {
  return [...job.executionEvents]
    .filter((event) => actions.includes(event.action))
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())[0];
}

function durationLabel(startedAt: number, endedAt: number): string {
  return compactDuration(Math.max(0, endedAt - startedAt));
}

function compactDuration(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.floor(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
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
