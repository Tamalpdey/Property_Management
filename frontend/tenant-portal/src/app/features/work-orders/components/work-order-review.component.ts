import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type {
  WorkOrderReview,
  WorkOrderReviewFieldNote,
  WorkOrderEvidence,
  WorkOrderTimeEntry,
  WorkOrderCommunication,
  WorkOrderAuditEntry,
  WorkOrderReviewActionRequest,
  WorkOrderAssignment,
  WorkOrderTask,
  WorkOrderType,
  WorkOrderLink,
  WorkOrderRouteStop,
  WorkOrderMaintenanceRecord
} from '@lorne/contracts';

export type WorkOrderReviewTab = 'SUMMARY' | 'WORKERS' | 'EVIDENCE' | 'RESOURCES' | 'INVOICE' | 'COMMUNICATION' | 'TIME' | 'AUDIT';
type AuditGroupTab = 'WORKER' | 'ADMIN';

interface WorkOrderWorkerSummary {
  assignment: WorkOrderAssignment;
  notes: WorkOrderReviewFieldNote[];
  evidence: WorkOrderEvidence[];
  timeEntries: WorkOrderTimeEntry[];
  tasks: WorkOrderTask[];
  auditEntries: WorkOrderAuditEntry[];
  materialEvents: WorkOrderAuditEntry[];
  totalWorkMinutes: number;
}

@Component({
  selector: 'lorne-work-order-review',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, NgTemplateOutlet, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host .lorne-review-tab-active {
      background: #0f172a !important;
      border-color: #0f172a !important;
      color: #fff !important;
      box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.25) !important;
    }

    :host .lorne-review-subtab-active {
      background: #0f766e !important;
      border-color: #0f766e !important;
      color: #fff !important;
      box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.18) !important;
    }
  `],
  template: `
    @if (review(); as data) {
      <section>
        <div class="screen-work-order-review space-y-3">
          <div class="rounded-lg border border-slate-200 bg-slate-950 px-4 py-3 text-white">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-xs font-black uppercase tracking-wide text-teal-200">{{ data.workOrder.workOrderNumber }}</p>
                <span [class]="workOrderTypeClass(data.workOrder.workOrderType)">{{ workOrderTypeLabel(data.workOrder.workOrderType) }}</span>
              </div>
              <h2 class="mt-1 text-2xl font-black leading-tight">{{ data.workOrder.propertyName }}</h2>
              <p class="mt-1 text-sm font-bold text-slate-200">{{ data.workOrder.title }}</p>
            </div>
            <div class="flex flex-wrap items-center gap-2 md:justify-end">
              <p-tag [value]="statusLabel(data.workOrder.status)" [severity]="statusSeverity(data.workOrder.status)" />
              @if (canManageBilling() && canGenerateInvoice(data) && data.invoices.length === 0) {
                <button pButton type="button" size="small" icon="pi pi-file-edit" label="Generate invoice" [loading]="busy()" (click)="generateInvoice.emit()"></button>
              }
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-print" label="Print" (click)="printWorkOrder.emit()"></button>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-clipboard" label="Maintenance record" (click)="printMaintenanceRecord.emit()"></button>
            </div>
          </div>
          </div>

          <div class="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 sm:grid-cols-4 xl:grid-cols-8">
          @for (tab of tabs; track tab.value) {
            <button
              pButton
              type="button"
              size="small"
              [severity]="activeTab() === tab.value ? 'primary' : 'secondary'"
              [text]="activeTab() !== tab.value"
              [icon]="tab.icon"
              [label]="tab.label"
              [class.lorne-review-tab-active]="activeTab() === tab.value"
              (click)="activeTab.set(tab.value)"
            ></button>
          }
          </div>

          @if (error()) {
            <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
          }

        @if (activeTab() === 'SUMMARY') {
          <section class="grid gap-3 lg:grid-cols-[1fr_18rem]">
            <div class="space-y-3">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Dispatch instructions</p>
                <p class="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{{ data.workOrder.description || 'No dispatch instructions.' }}</p>
              </div>
              @if (data.workOrder.routeStops.length || data.workOrder.linkedWorkOrders.length || data.workOrder.linkedFromWorkOrders.length) {
                <div class="grid gap-3 md:grid-cols-2">
                  <div class="rounded-lg border border-slate-200 bg-white p-3">
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Route stops</p>
                    <div class="mt-2 grid gap-2">
                      @for (stop of data.workOrder.routeStops; track stop.id) {
                        <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                          <div class="flex flex-wrap items-center justify-between gap-2">
                            <span class="text-sm font-black text-slate-950">{{ stop.stopOrder }}. {{ routeStopTypeLabel(stop.stopType) }} · {{ stop.name }}</span>
                            <span [class]="routeStopStatusClass(stop)">{{ routeStopStatusLabel(stop) }}</span>
                          </div>
                          <div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-500">
                            @if (stop.plannedArrival) {
                              <span class="rounded-full bg-white px-2 py-1">Planned {{ stop.plannedArrival | date:'MMM d, h:mm a' }}</span>
                            }
                            @if (stop.arrivedAt) {
                              <span class="rounded-full bg-teal-50 px-2 py-1 text-teal-700">Arrived {{ stop.arrivedAt | date:'MMM d, h:mm a' }}</span>
                            }
                            @if (stop.completedAt) {
                              <span class="rounded-full bg-green-50 px-2 py-1 text-green-700">Done {{ stop.completedAt | date:'MMM d, h:mm a' }}</span>
                            }
                            @if (stop.skippedAt) {
                              <span class="rounded-full bg-amber-50 px-2 py-1 text-amber-700">Skipped {{ stop.skippedAt | date:'MMM d, h:mm a' }}</span>
                            }
                          </div>
                          @if (stop.address) {
                            <p class="mt-1 text-xs font-bold text-slate-600">{{ stop.address }}</p>
                          }
                          @if (stop.instructions) {
                            <p class="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-600">{{ stop.instructions }}</p>
                          }
                          @if (stop.skippedReason) {
                            <p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">Skipped reason: {{ stop.skippedReason }}</p>
                          }
                        </div>
                      } @empty {
                        <p class="text-sm font-semibold text-slate-500">No route stops.</p>
                      }
                    </div>
                  </div>
                  <div class="rounded-lg border border-slate-200 bg-white p-3">
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Linked work orders</p>
                    <div class="mt-2 grid gap-2">
                      @for (link of data.workOrder.linkedWorkOrders; track link.linkedWorkOrderId + link.linkType) {
                        <button type="button" class="w-full rounded-lg bg-slate-50 px-3 py-2 text-left transition hover:bg-teal-50" (click)="openLinkedWorkOrder.emit(link.linkedWorkOrderId)">
                          <ng-container *ngTemplateOutlet="linkedWorkOrderContent; context: { $implicit: link, direction: 'outbound' }"></ng-container>
                        </button>
                      } @empty {
                        <p class="text-sm font-semibold text-slate-500">No linked work orders.</p>
                      }
                    </div>
                    @if (data.workOrder.linkedFromWorkOrders.length) {
                      <p class="mt-3 text-xs font-black uppercase tracking-wide text-teal-700">Linked from</p>
                      <div class="mt-2 grid gap-2">
                        @for (link of data.workOrder.linkedFromWorkOrders; track link.linkedWorkOrderId + link.linkType) {
                          <button type="button" class="w-full rounded-lg bg-slate-50 px-3 py-2 text-left transition hover:bg-teal-50" (click)="openLinkedWorkOrder.emit(link.linkedWorkOrderId)">
                            <ng-container *ngTemplateOutlet="linkedWorkOrderContent; context: { $implicit: link, direction: 'inbound' }"></ng-container>
                          </button>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-lg border border-slate-200 bg-white p-3">
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Pre-start checklist</p>
                  <div class="mt-2 grid gap-2">
                    @for (task of tasksFor(data, 'PRE_START'); track task.id) {
                      <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span class="font-semibold text-slate-700">{{ task.label }}</span>
                        <p-tag [value]="task.completed ? 'done' : 'pending'" [severity]="task.completed ? 'success' : 'warn'" />
                      </span>
                    } @empty {
                      <p class="text-sm font-semibold text-slate-500">No pre-start checks.</p>
                    }
                  </div>
                </div>
                <div class="rounded-lg border border-slate-200 bg-white p-3">
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Completion checklist</p>
                  <div class="mt-2 grid gap-2">
                    @for (task of tasksFor(data, 'COMPLETION'); track task.id) {
                      <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        <span class="font-semibold text-slate-700">{{ task.label }}</span>
                        <p-tag [value]="task.completed ? 'done' : 'pending'" [severity]="task.completed ? 'success' : 'warn'" />
                      </span>
                    } @empty {
                      <p class="text-sm font-semibold text-slate-500">No completion checks.</p>
                    }
                  </div>
                </div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Field notes</p>
                <div class="mt-2 grid gap-2">
                  @for (note of data.fieldNotes; track note.id) {
                    <div class="rounded-lg bg-slate-50 px-3 py-2">
                      <p class="text-xs font-black text-slate-500">{{ note.workerName }} · {{ note.updatedAt | date:'MMM d, h:mm a' }}</p>
                      <p class="mt-1 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{{ note.note }}</p>
                    </div>
                  } @empty {
                    <p class="text-sm font-semibold text-slate-500">No field notes.</p>
                  }
                </div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Maintenance records</p>
                    <p class="text-sm font-semibold text-slate-500">Structured records submitted from the worker app.</p>
                  </div>
                  <p-tag [value]="maintenanceRecords(data).length + ' saved'" severity="info" />
                </div>
                <div class="mt-3 grid gap-2">
                  @for (record of maintenanceRecords(data); track record.id) {
                    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p class="text-sm font-black text-slate-950">{{ recordTitle(record) }}</p>
                          <p class="text-xs font-bold text-slate-500">{{ record.workerName }} · {{ record.updatedAt | date:'MMM d, h:mm a' }}</p>
                        </div>
                        <p-tag [value]="recordSummary(record)" severity="success" />
                      </div>
                      @if (record.recordData.clientNote) {
                        <p class="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{{ record.recordData.clientNote }}</p>
                      }
                    </div>
                  } @empty {
                    <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-500">
                      No maintenance record has been submitted for this work order yet.
                    </p>
                  }
                </div>
              </div>
            </div>

            <aside class="space-y-3">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Property</p>
                <p class="mt-1 text-sm font-black text-slate-950">{{ data.workOrder.propertyAddress }}</p>
                <p class="mt-1 text-xs font-bold text-slate-500">{{ data.workOrder.ownerName }} · {{ data.workOrder.serviceName || 'General service' }}</p>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Workers</p>
                <div class="mt-2 grid gap-2">
                  @for (assignment of data.workOrder.assignments; track assignment.workerId) {
                    <span class="rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                      {{ assignment.workerName }}{{ assignment.leadWorker ? ' · lead' : '' }} · {{ assignment.assignmentStatus.toLowerCase().replaceAll('_', ' ') }}
                    </span>
                  } @empty {
                    <p class="text-sm font-semibold text-slate-500">No workers assigned.</p>
                  }
                </div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials</p>
                <p class="mt-1 text-sm font-black text-slate-950">{{ usedMaterialCount(data) }}/{{ data.workOrder.materials.length }} used</p>
                <p class="mt-1 text-xs font-bold text-slate-500">{{ data.workOrder.assets.length }} tools/equipment assigned</p>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Invoice</p>
                @if (data.invoices[0]; as invoice) {
                  <p class="mt-1 text-sm font-black text-slate-950">{{ invoice.invoiceNumber }}</p>
                  <p class="mt-1 text-xs font-bold text-slate-500">{{ invoice.status.toLowerCase() }} · {{ currency(invoice.total) }}</p>
                } @else {
                  <p class="mt-1 text-sm font-bold text-slate-500">No invoice generated.</p>
                  <p class="mt-1 text-xs font-semibold leading-5 text-slate-500">Uses service base price plus materials marked used. Invoice email is sent separately.</p>
                }
              </div>
            </aside>
          </section>
        }

        @if (activeTab() === 'WORKERS') {
          <section class="grid gap-3">
            @for (worker of workerSummaries(data); track worker.assignment.workerId) {
              <article class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div class="min-w-0">
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ worker.assignment.leadWorker ? 'Lead worker' : 'Assigned worker' }}</p>
                    <h3 class="mt-1 text-lg font-black text-slate-950">{{ worker.assignment.workerName }}</h3>
                    <p class="text-xs font-bold text-slate-500">{{ worker.assignment.workerEmail || 'No login email linked' }}</p>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    @if (worker.assignment.leadWorker) {
                      <p-tag value="lead" severity="info" />
                    }
                    <p-tag [value]="statusLabel(worker.assignment.assignmentStatus)" [severity]="assignmentSeverity(worker.assignment.assignmentStatus)" />
                  </div>
                </div>

                <div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase tracking-wide text-slate-500">Work time</p>
                    <p class="mt-1 text-base font-black text-slate-950">{{ minutesLabel(worker.totalWorkMinutes) }}</p>
                  </div>
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase tracking-wide text-slate-500">Checks</p>
                    <p class="mt-1 text-base font-black text-slate-950">{{ completedTaskCount(worker.tasks) }}/{{ worker.tasks.length }}</p>
                  </div>
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase tracking-wide text-slate-500">Notes</p>
                    <p class="mt-1 text-base font-black text-slate-950">{{ worker.notes.length }}</p>
                  </div>
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase tracking-wide text-slate-500">Evidence</p>
                    <p class="mt-1 text-base font-black text-slate-950">{{ worker.evidence.length }}</p>
                  </div>
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-xs font-black uppercase tracking-wide text-slate-500">Events</p>
                    <p class="mt-1 text-base font-black text-slate-950">{{ worker.auditEntries.length }}</p>
                  </div>
                </div>

                <div class="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
                  <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker timeline</p>
                    <div class="mt-2 grid gap-2">
                      @for (audit of worker.auditEntries.slice(0, 8); track audit.id) {
                        <div class="grid grid-cols-[auto_1fr] gap-2 rounded-lg bg-white px-3 py-2">
                          <span class="mt-0.5 grid h-7 w-7 place-items-center rounded-full bg-teal-50 text-teal-800">
                            <i [class]="timelineIcon(audit.action)"></i>
                          </span>
                          <span class="min-w-0">
                            <span class="block text-sm font-black text-slate-950">{{ actionLabel(audit.action) }}</span>
                            <span class="block text-xs font-bold text-slate-500">{{ audit.createdAt | date:'MMM d, h:mm a' }}</span>
                            <span class="mt-1 block text-sm font-semibold leading-5 text-slate-700">{{ auditSummary(audit) }}</span>
                          </span>
                        </div>
                      } @empty {
                        <p class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-sm font-semibold text-slate-500">No worker activity recorded.</p>
                      }
                    </div>
                  </div>

                  <div class="space-y-3">
                    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p class="text-xs font-black uppercase tracking-wide text-teal-700">Field notes</p>
                      <div class="mt-2 grid gap-2">
                        @for (note of worker.notes; track note.id) {
                          <div class="rounded-lg bg-white px-3 py-2">
                            <p class="text-xs font-black text-slate-500">{{ note.updatedAt | date:'MMM d, h:mm a' }}</p>
                            <p class="mt-1 whitespace-pre-wrap text-sm font-semibold leading-5 text-slate-700">{{ note.note }}</p>
                          </div>
                        } @empty {
                          <p class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-sm font-semibold text-slate-500">No notes from this worker.</p>
                        }
                      </div>
                    </div>

                    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p class="text-xs font-black uppercase tracking-wide text-teal-700">Evidence and materials</p>
                      <div class="mt-2 grid grid-cols-2 gap-2">
                        @for (item of worker.evidence.slice(0, 4); track item.documentId + item.createdAt) {
                          <button type="button" class="overflow-hidden rounded-lg border border-slate-200 bg-white text-left" (click)="openEvidence(evidenceIndex(data, item))">
                            <div class="h-16 bg-slate-100">
                              @if (isImageEvidence(item) && item.viewUrl) {
                                <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="h-full w-full object-cover" loading="lazy" />
                              } @else {
                                <div class="grid h-full place-items-center text-slate-500"><i [class]="evidenceIcon(item)" class="text-xl"></i></div>
                              }
                            </div>
                            <div class="p-2">
                              <span class="block truncate text-xs font-black text-slate-950">{{ evidenceLabel(item) }}</span>
                              <span class="block truncate text-xs font-semibold text-slate-500">{{ item.createdAt | date:'MMM d, h:mm a' }}</span>
                            </div>
                          </button>
                        } @empty {
                          <p class="col-span-2 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-5 text-center text-sm font-semibold text-slate-500">No evidence from this worker.</p>
                        }
                      </div>
                      @if (worker.evidence.length > 4) {
                        <p class="mt-2 text-xs font-bold text-slate-500">+{{ worker.evidence.length - 4 }} more evidence file(s) in the Evidence tab.</p>
                      }
                      <div class="mt-3 grid gap-1">
                        @for (material of worker.materialEvents; track material.id) {
                          <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ workerMaterialLabel(material) }}</span>
                        } @empty {
                          <span class="text-xs font-semibold text-slate-500">No material usage recorded by this worker.</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm font-semibold text-slate-500">No workers assigned.</p>
            }
          </section>
        }

        @if (activeTab() === 'EVIDENCE') {
          <section class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-sm font-bold text-slate-700">Evidence is read-only in review. Use the work-order actions menu to upload photos or receipts through Operations override.</p>
            </div>

            <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            @for (item of data.evidence; track item.documentId + item.createdAt; let index = $index) {
              <button type="button" class="grid grid-cols-[5rem_1fr] overflow-hidden rounded-lg border border-slate-200 bg-white p-0 text-left shadow-sm transition hover:border-teal-300 hover:shadow-md" (click)="openEvidence(index)">
                <div class="h-20 bg-slate-100">
                  @if (isImageEvidence(item) && item.viewUrl) {
                    <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="h-full w-full object-cover" loading="lazy" />
                  } @else {
                    <div class="grid h-full place-items-center text-slate-500">
                      <span class="text-center">
                        <i [class]="evidenceIcon(item)" class="text-3xl"></i>
                      </span>
                    </div>
                  }
                </div>
                <div class="min-w-0 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <span class="min-w-0">
                      <span class="block text-xs font-black uppercase tracking-wide text-teal-700">{{ evidenceLabel(item) }}</span>
                      <span class="mt-1 block truncate text-sm font-black text-slate-950">{{ item.caption || fileName(item.objectKey) }}</span>
                    </span>
                    <p-tag [value]="evidenceTypeLabel(item)" severity="secondary" />
                  </div>
                  <p class="mt-2 text-xs font-bold text-slate-500">{{ item.createdByName || 'Field worker' }} · {{ item.createdAt | date:'MMM d, h:mm a' }}</p>
                </div>
              </button>
            } @empty {
              <p class="rounded-lg border border-slate-200 bg-white px-3 py-8 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">No photos or receipts uploaded yet.</p>
            }
            </div>
          </section>
        }

        @if (activeTab() === 'RESOURCES') {
          <section class="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Materials and inventory</p>
                  <h3 class="mt-1 text-lg font-black text-slate-950">Planned, used, and billable items</h3>
                </div>
                <p-tag [value]="usedMaterialCount(data) + '/' + data.workOrder.materials.length + ' used'" severity="info" />
              </div>
              <div class="mt-3 overflow-hidden rounded-lg border border-slate-200">
                <table class="w-full border-collapse text-sm">
                  <thead class="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th class="px-3 py-2">Item</th>
                      <th class="px-3 py-2">Qty</th>
                      <th class="px-3 py-2">Cost</th>
                      <th class="px-3 py-2">Use</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (material of data.workOrder.materials; track material.id) {
                      <tr>
                        <td class="px-3 py-2">
                          <p class="font-black text-slate-950">{{ material.itemName || material.description }}</p>
                          <p class="mt-0.5 text-xs font-semibold text-slate-500">{{ material.description }}</p>
                        </td>
                        <td class="px-3 py-2 font-semibold text-slate-700">{{ material.quantity }} {{ material.unit || '' }}</td>
                        <td class="px-3 py-2 font-semibold text-slate-700">{{ material.unitCost === undefined || material.unitCost === null ? '-' : currency(material.unitCost) }}</td>
                        <td class="px-3 py-2"><p-tag [value]="material.used ? 'used' : 'planned'" [severity]="material.used ? 'success' : 'warn'" /></td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="4" class="px-3 py-8 text-center text-sm font-semibold text-slate-500">No materials recorded.</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>

            <div class="space-y-3">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-xs font-black uppercase tracking-wide text-teal-700">Tools and equipment</p>
                    <h3 class="mt-1 text-lg font-black text-slate-950">Assigned assets</h3>
                  </div>
                  <p-tag [value]="data.workOrder.assets.length + ' assigned'" severity="secondary" />
                </div>
                <div class="mt-3 grid gap-2">
                  @for (asset of data.workOrder.assets; track asset.assetId) {
                    <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p class="text-sm font-black text-slate-950">{{ asset.name }}</p>
                      <p class="mt-0.5 text-xs font-bold uppercase tracking-wide text-slate-500">{{ asset.assetType }}{{ asset.identifier ? ' · ' + asset.identifier : '' }}</p>
                    </div>
                  } @empty {
                    <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No tools or equipment assigned.</p>
                  }
                </div>
              </div>

              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Purchase receipts</p>
                <div class="mt-3 grid gap-2">
                  @for (item of receiptEvidence(data); track item.documentId + item.createdAt) {
                    <button type="button" class="grid grid-cols-[3.5rem_1fr] overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-0 text-left" (click)="openEvidence(evidenceIndex(data, item))">
                      <span class="grid h-14 place-items-center bg-white text-slate-600"><i class="pi pi-receipt text-xl"></i></span>
                      <span class="min-w-0 p-2">
                        <span class="block truncate text-sm font-black text-slate-950">{{ item.caption || fileName(item.objectKey) }}</span>
                        <span class="block text-xs font-bold text-slate-500">{{ item.createdByName || 'Field worker' }} · {{ item.createdAt | date:'MMM d, h:mm a' }}</span>
                      </span>
                    </button>
                  } @empty {
                    <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">No purchase receipts uploaded.</p>
                  }
                </div>
              </div>
            </div>
          </section>
        }

        @if (activeTab() === 'INVOICE') {
          <section class="grid gap-3 lg:grid-cols-[1fr_18rem]">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Invoice</p>
                  <h3 class="mt-1 text-lg font-black text-slate-950">Billing generated from approved work</h3>
                  <p class="mt-1 text-xs font-semibold text-slate-500">Draft invoices use the service charge plus materials marked used. Email delivery is handled from the invoices workflow.</p>
                </div>
                @if (canManageBilling() && canGenerateInvoice(data) && data.invoices.length === 0) {
                  <button pButton type="button" size="small" icon="pi pi-file-edit" label="Generate invoice" [loading]="busy()" (click)="generateInvoice.emit()"></button>
                }
              </div>

              <div class="mt-3 grid gap-2">
                @for (invoice of data.invoices; track invoice.id) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p class="text-sm font-black text-slate-950">{{ invoice.invoiceNumber }}</p>
                        <p class="mt-1 text-xs font-bold text-slate-500">Issued {{ invoice.issuedOn || '-' }} · Due {{ invoice.dueOn || '-' }}</p>
                      </div>
                      <p-tag [value]="invoice.status.toLowerCase().replaceAll('_', ' ')" [severity]="invoice.status === 'PAID' ? 'success' : invoice.status === 'VOID' ? 'danger' : 'info'" />
                    </div>
                    <div class="mt-3 grid grid-cols-3 gap-2">
                      <span class="rounded-lg bg-white px-3 py-2">
                        <span class="block text-xs font-black uppercase tracking-wide text-slate-500">Subtotal</span>
                        <span class="mt-1 block text-sm font-black text-slate-950">{{ currency(invoice.subtotal) }}</span>
                      </span>
                      <span class="rounded-lg bg-white px-3 py-2">
                        <span class="block text-xs font-black uppercase tracking-wide text-slate-500">Tax</span>
                        <span class="mt-1 block text-sm font-black text-slate-950">{{ currency(invoice.taxTotal) }}</span>
                      </span>
                      <span class="rounded-lg bg-white px-3 py-2">
                        <span class="block text-xs font-black uppercase tracking-wide text-slate-500">Total</span>
                        <span class="mt-1 block text-sm font-black text-slate-950">{{ currency(invoice.total) }}</span>
                      </span>
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm font-semibold text-slate-500">No invoice generated yet.</p>
                }
              </div>
            </div>

            <aside class="space-y-3">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Billing readiness</p>
                <div class="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Work approved
                    <p-tag [value]="canGenerateInvoice(data) ? 'ready' : 'not ready'" [severity]="canGenerateInvoice(data) ? 'success' : 'warn'" />
                  </span>
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Used materials
                    <strong>{{ usedMaterialCount(data) }}</strong>
                  </span>
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Receipts
                    <strong>{{ receiptEvidence(data).length }}</strong>
                  </span>
                </div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Owner</p>
                <p class="mt-1 text-sm font-black text-slate-950">{{ data.workOrder.ownerName }}</p>
                <p class="mt-1 text-xs font-semibold text-slate-500">{{ data.workOrder.requesterEmail || 'Use owner billing email from invoice workflow' }}</p>
              </div>
            </aside>
          </section>
        }

        @if (activeTab() === 'COMMUNICATION') {
          <section class="grid gap-3 lg:grid-cols-[1fr_18rem]">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Owner communication</p>
                  <h3 class="mt-1 text-lg font-black text-slate-950">Completion notices and invoice emails</h3>
                  <p class="mt-1 text-xs font-semibold text-slate-500">Every send is recorded here with recipient, status, provider response, and message preview.</p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    pButton
                    type="button"
                    size="small"
                    icon="pi pi-send"
                    label="Notify owner"
                    [disabled]="!canNotifyOwner(data)"
                    [loading]="busy()"
                    (click)="notifyOwner.emit()"
                  ></button>
                  @if (data.invoices[0]; as invoice) {
                    <button
                      pButton
                      type="button"
                      size="small"
                      severity="success"
                      icon="pi pi-envelope"
                      label="Send invoice"
                      [loading]="busy()"
                      (click)="sendInvoiceEmail.emit(invoice.id)"
                    ></button>
                  }
                </div>
              </div>

              <div class="mt-3 grid gap-2">
                @for (communication of data.communications; track communication.id) {
                  <article class="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="text-sm font-black text-slate-950">{{ communicationLabel(communication) }}</p>
                          @if (communication.invoiceNumber) {
                            <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ communication.invoiceNumber }}</span>
                          }
                        </div>
                        <p class="mt-1 text-xs font-bold text-slate-500">{{ communication.recipientEmail }} · {{ communication.createdAt | date:'MMM d, h:mm a' }}</p>
                      </div>
                      <p-tag [value]="communication.status.toLowerCase()" [severity]="communicationSeverity(communication.status)" />
                    </div>
                    <div class="mt-3 rounded-lg bg-white px-3 py-2">
                      <p class="text-xs font-black uppercase tracking-wide text-slate-500">Subject</p>
                      <p class="mt-1 text-sm font-black text-slate-950">{{ communication.subject }}</p>
                      <p class="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">Message preview</p>
                      <p class="mt-1 line-clamp-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-slate-700">{{ communication.body }}</p>
                    </div>
                    @if (communication.providerMessage) {
                      <p class="mt-2 text-xs font-semibold text-slate-500">{{ communication.providerMessage }}</p>
                    }
                  </article>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm font-semibold text-slate-500">No owner emails recorded for this work order yet.</p>
                }
              </div>
            </div>

            <aside class="space-y-3">
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Delivery summary</p>
                <div class="mt-3 grid gap-2 text-sm font-semibold text-slate-700">
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Completion notices
                    <strong>{{ completionCommunications(data).length }}</strong>
                  </span>
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Invoice emails
                    <strong>{{ invoiceCommunications(data).length }}</strong>
                  </span>
                  <span class="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                    Failed
                    <strong>{{ failedCommunications(data).length }}</strong>
                  </span>
                </div>
              </div>
              <div class="rounded-lg border border-slate-200 bg-white p-3">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Template setup</p>
                <p class="mt-1 text-sm font-semibold leading-6 text-slate-700">Completion and invoice email copy is tenant-specific. Update templates from the Email templates menu before sending live mail.</p>
              </div>
            </aside>
          </section>
        }

        @if (activeTab() === 'TIME') {
          <section class="grid gap-3 lg:grid-cols-[1fr_19rem]">
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Operational timeline</p>
              <div class="mt-3 grid gap-2">
                @for (audit of operationalTimelineEntries(data); track audit.id) {
                  <div class="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span class="mt-1 grid h-8 w-8 place-items-center rounded-full" [class.bg-teal-100]="isWorkerAudit(audit)" [class.text-teal-800]="isWorkerAudit(audit)" [class.bg-sky-100]="!isWorkerAudit(audit)" [class.text-sky-800]="!isWorkerAudit(audit)">
                      <i [class]="timelineIcon(audit.action)"></i>
                    </span>
                    <span>
                      <span class="block text-sm font-black text-slate-950">{{ actionLabel(audit.action) }}</span>
                      <span class="block text-xs font-bold text-slate-500">{{ audit.createdAt | date:'MMM d, h:mm a' }} · {{ audit.actorName || 'System' }}</span>
                      <span class="mt-1 block text-sm font-semibold leading-5 text-slate-700">{{ auditSummary(audit) }}</span>
                    </span>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No operational timeline events recorded.</p>
                }
              </div>
            </div>

            <aside class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Work time</p>
              <div class="mt-3 grid gap-2">
                @for (entry of data.timeEntries; track entry.id) {
                  <div class="rounded-lg bg-slate-50 px-3 py-2">
                    <p class="text-sm font-black text-slate-950">{{ entry.workerName }}</p>
                    <p class="mt-1 text-xs font-bold text-slate-500">{{ timeEntryLabel(entry.entryType) }} · {{ entry.durationMinutes === undefined || entry.durationMinutes === null ? 'open' : entry.durationMinutes + ' min' }}</p>
                    <p class="mt-1 text-xs font-semibold text-slate-500">{{ entry.startedAt | date:'MMM d, h:mm a' }} - {{ entry.endedAt ? (entry.endedAt | date:'MMM d, h:mm a') : 'Open' }}</p>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">No work time entries.</p>
                }
              </div>
            </aside>
          </section>
        }

        @if (activeTab() === 'AUDIT') {
          <section class="space-y-3">
            <div class="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                pButton
                type="button"
                size="small"
                icon="pi pi-user"
                label="Worker activity"
                [severity]="auditGroupTab() === 'WORKER' ? 'primary' : 'secondary'"
                [text]="auditGroupTab() !== 'WORKER'"
                [class.lorne-review-subtab-active]="auditGroupTab() === 'WORKER'"
                (click)="auditGroupTab.set('WORKER')"
              ></button>
              <button
                pButton
                type="button"
                size="small"
                icon="pi pi-building"
                label="Tenant/Admin activity"
                [severity]="auditGroupTab() === 'ADMIN' ? 'primary' : 'secondary'"
                [text]="auditGroupTab() !== 'ADMIN'"
                [class.lorne-review-subtab-active]="auditGroupTab() === 'ADMIN'"
                (click)="auditGroupTab.set('ADMIN')"
              ></button>
            </div>

            @if (auditGroupTab() === 'WORKER') {
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Worker activity</p>
              <div class="mt-3 grid gap-2">
                @for (audit of workerAuditEntries(data); track audit.id) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div class="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p class="text-sm font-black text-slate-950">{{ actionLabel(audit.action) }}</p>
                        <p class="text-xs font-bold text-slate-500">{{ audit.actorName || 'Worker' }} · {{ audit.createdAt | date:'MMM d, h:mm a' }}</p>
                      </div>
                      <p-tag [value]="audit.actorEmail || 'worker'" severity="secondary" />
                    </div>
                    <p class="mt-2 text-sm font-semibold leading-6 text-slate-700">{{ auditSummary(audit) }}</p>
                    <div class="mt-2 flex flex-wrap gap-1">
                      @for (entry of metadataEntries(audit); track entry.key) {
                        <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ entry.key }}: {{ entry.value }}</span>
                      } @empty {
                        <span class="text-xs font-semibold text-slate-500">No user-facing details</span>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No worker activity yet.</p>
                }
              </div>
            </div>
            }

            @if (auditGroupTab() === 'ADMIN') {
            <div class="rounded-lg border border-slate-200 bg-white p-3">
              <p class="text-xs font-black uppercase tracking-wide text-sky-700">Tenant/admin activity</p>
              <div class="mt-3 grid gap-2">
                @for (audit of tenantAuditEntries(data); track audit.id) {
                  <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div class="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p class="text-sm font-black text-slate-950">{{ actionLabel(audit.action) }}</p>
                        <p class="text-xs font-bold text-slate-500">{{ audit.actorName || 'System' }} · {{ audit.createdAt | date:'MMM d, h:mm a' }}</p>
                      </div>
                      <p-tag [value]="audit.actorEmail || 'system'" severity="secondary" />
                    </div>
                    <p class="mt-2 text-sm font-semibold leading-6 text-slate-700">{{ auditSummary(audit) }}</p>
                    <div class="mt-2 flex flex-wrap gap-1">
                      @for (entry of metadataEntries(audit); track entry.key) {
                        <span class="rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-600">{{ entry.key }}: {{ entry.value }}</span>
                      } @empty {
                        <span class="text-xs font-semibold text-slate-500">No user-facing details</span>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No tenant/admin activity yet.</p>
                }
              </div>
            </div>
            }
          </section>
        }

        @if (canManageWorkOrders() && data.workOrder.status === 'PENDING_COMPLETION') {
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <label class="block">
              <span class="mb-1 block text-sm font-black text-amber-900">Review note</span>
              <textarea class="w-full border border-amber-200 px-3 py-2 text-sm" rows="2" name="reviewNote" [(ngModel)]="reviewNote"></textarea>
            </label>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button pButton type="button" severity="secondary" icon="pi pi-replay" label="Send back" [loading]="busy()" (click)="sendBack()"></button>
              <button pButton type="button" icon="pi pi-check-circle" label="Approve work" [loading]="busy()" (click)="approve()"></button>
              <button pButton type="button" severity="success" icon="pi pi-file-edit" label="Approve + invoice" [disabled]="!canManageBilling()" [loading]="busy()" (click)="approveAndInvoice()"></button>
            </div>
          </div>
        }
        @if (canOverrideComplete(data)) {
          <div class="rounded-lg border border-red-200 bg-red-50 p-3">
            <label class="block">
              <span class="mb-1 block text-sm font-black text-red-900">Override completion reason</span>
              <textarea
                class="w-full border border-red-200 px-3 py-2 text-sm"
                rows="2"
                name="reviewNote"
                placeholder="Explain why operations is closing field work before all assigned workers submitted."
                [(ngModel)]="reviewNote"
              ></textarea>
            </label>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-xs font-bold leading-5 text-red-800">This releases unfinished worker assignments and moves the work order to pending completion for review.</p>
              <button
                pButton
                type="button"
                severity="danger"
                icon="pi pi-lock"
                label="Override complete"
                [disabled]="!reviewNote.trim()"
                [loading]="busy()"
                (click)="overrideComplete()"
              ></button>
            </div>
          </div>
        }
        </div>

        <section class="printable-work-order">
          <div class="print-header">
            <div>
              <p class="print-eyebrow">Work Order</p>
              <h1>{{ data.workOrder.workOrderNumber }}</h1>
              <p>{{ data.workOrder.title }}</p>
            </div>
            <div class="print-status">
              <strong>{{ statusLabel(data.workOrder.status) }}</strong>
              <span>{{ data.workOrder.scheduledStart ? (data.workOrder.scheduledStart | date:'MMM d, y, h:mm a') : 'Unscheduled' }}</span>
            </div>
          </div>

          <div class="print-grid">
            <section>
              <h2>Property</h2>
              <p><strong>{{ data.workOrder.propertyName }}</strong></p>
              <p>{{ data.workOrder.propertyAddress }}</p>
              <p>Owner: {{ data.workOrder.ownerName }}</p>
              <p>Service: {{ data.workOrder.serviceName || 'General service' }}</p>
            </section>
            <section>
              <h2>Schedule</h2>
              <p>Start: {{ data.workOrder.scheduledStart ? (data.workOrder.scheduledStart | date:'MMM d, y, h:mm a') : 'Unscheduled' }}</p>
              <p>End: {{ data.workOrder.scheduledEnd ? (data.workOrder.scheduledEnd | date:'MMM d, y, h:mm a') : 'Open' }}</p>
              <p>Priority: {{ data.workOrder.priority }}</p>
              <p>Source: {{ data.workOrder.source.toLowerCase().replaceAll('_', ' ') }}</p>
            </section>
          </div>

          <section>
            <h2>Dispatch Instructions</h2>
            <p>{{ data.workOrder.description || 'No dispatch instructions.' }}</p>
          </section>

          <section>
            <h2>Assigned Workers</h2>
            <table>
              <thead><tr><th>Name</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                @for (assignment of data.workOrder.assignments; track assignment.workerId) {
                  <tr><td>{{ assignment.workerName }}</td><td>{{ assignment.leadWorker ? 'Lead' : 'Assigned' }}</td><td>{{ assignment.assignmentStatus }}</td></tr>
                }
              </tbody>
            </table>
          </section>

          <section>
            <h2>Checklist</h2>
            <table>
              <thead><tr><th>Phase</th><th>Item</th><th>Required</th><th>Status</th></tr></thead>
              <tbody>
                @for (task of data.workOrder.tasks; track task.id) {
                  <tr><td>{{ task.phase }}</td><td>{{ task.label }}</td><td>{{ task.required ? 'Yes' : 'No' }}</td><td>{{ task.completed ? 'Done' : 'Pending' }}</td></tr>
                }
              </tbody>
            </table>
          </section>

          <section>
            <h2>Materials And Equipment</h2>
            <table>
              <thead><tr><th>Description</th><th>Qty</th><th>Used</th><th>Unit Cost</th></tr></thead>
              <tbody>
                @for (material of data.workOrder.materials; track material.id) {
                  <tr><td>{{ material.itemName || material.description }}</td><td>{{ material.quantity }} {{ material.unit || '' }}</td><td>{{ material.used ? 'Yes' : 'No' }}</td><td>{{ material.unitCost === undefined || material.unitCost === null ? '-' : currency(material.unitCost) }}</td></tr>
                }
              </tbody>
            </table>
          </section>

          <section>
            <h2>Field Notes</h2>
            @for (note of data.fieldNotes; track note.id) {
              <p><strong>{{ note.workerName }}:</strong> {{ note.note }}</p>
            } @empty {
              <p>No field notes.</p>
            }
          </section>

          <section>
            <h2>Evidence And Receipts</h2>
            <p>{{ data.evidence.length }} files recorded.</p>
            @for (item of data.evidence; track item.documentId + item.createdAt) {
              <p>{{ evidenceLabel(item) }}: {{ item.caption || item.objectKey }}</p>
            }
          </section>

          @if (data.invoices[0]; as invoice) {
            <section>
              <h2>Invoice</h2>
              <p><strong>{{ invoice.invoiceNumber }}</strong> · {{ invoice.status }} · Total {{ currency(invoice.total) }}</p>
              <p>Issued {{ invoice.issuedOn || '-' }} · Due {{ invoice.dueOn || '-' }}</p>
            </section>
          }
        </section>
      </section>

      <p-dialog
        header="Evidence preview"
        [modal]="true"
        [visible]="evidencePreviewOpen()"
        [style]="{ width: 'min(46rem, 94vw)' }"
        [contentStyle]="{ overflow: 'hidden' }"
        (visibleChange)="!$event && closeEvidencePreview()"
      >
        @if (selectedEvidence(); as item) {
          <section class="space-y-3">
            <div class="grid h-[min(24rem,58vh)] place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
              @if (isImageEvidence(item) && item.viewUrl) {
                <img [src]="item.viewUrl" [alt]="evidenceLabel(item)" class="max-h-full max-w-full object-contain" />
              } @else if (item.viewUrl) {
                <div class="grid h-full w-full place-items-center p-6 text-center text-slate-700">
                  <span>
                    <i [class]="evidenceIcon(item)" class="text-5xl"></i>
                    <span class="mt-3 block text-lg font-black">{{ evidenceLabel(item) }}</span>
                    <a [href]="item.viewUrl" target="_blank" rel="noopener" class="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-3 text-sm font-black text-white no-underline">Open file</a>
                  </span>
                </div>
              }
            </div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div class="min-w-0">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ evidencePreviewIndex() + 1 }} / {{ data.evidence.length }}</p>
                <p class="text-sm font-black text-slate-950">{{ item.caption || fileName(item.objectKey) }}</p>
                <p class="mt-1 text-xs font-bold text-slate-500">{{ evidenceLabel(item) }} · {{ item.createdByName || 'Field worker' }} · {{ item.createdAt | date:'MMM d, h:mm a' }}</p>
              </div>
              <div class="flex gap-2">
                <button pButton type="button" severity="secondary" icon="pi pi-chevron-left" label="Prev" [disabled]="data.evidence.length < 2" (click)="moveEvidence(-1)"></button>
                <button pButton type="button" severity="secondary" icon="pi pi-chevron-right" label="Next" [disabled]="data.evidence.length < 2" (click)="moveEvidence(1)"></button>
              </div>
            </div>
          </section>
        }
      </p-dialog>
    } @else {
      <section class="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p class="text-sm font-bold text-slate-500">{{ loading() ? 'Loading review...' : 'Select a work order to review.' }}</p>
      </section>
    }

    <ng-template #linkedWorkOrderContent let-link let-direction="direction">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-black text-teal-800">{{ link.workOrderNumber }}</span>
        <p-tag [value]="linkRelationshipLabel(link, direction)" severity="info" />
      </div>
      <p class="mt-1 text-sm font-bold text-slate-950">{{ link.title }}</p>
      <p class="text-xs font-semibold text-slate-500">{{ link.propertyName }} · {{ statusLabel(link.status) }}</p>
      @if (link.notes) {
        <p class="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-600">{{ link.notes }}</p>
      }
    </ng-template>
  `
})
export class WorkOrderReviewComponent {
  readonly review = input<WorkOrderReview | null>(null);
  readonly loading = input(false);
  readonly busy = input(false);
  readonly error = input('');
  readonly initialTab = input<WorkOrderReviewTab>('SUMMARY');
  readonly canManageWorkOrders = input(true);
  readonly canManageBilling = input(true);
  readonly reviewAction = output<WorkOrderReviewActionRequest>();
  readonly generateInvoice = output<void>();
  readonly notifyOwner = output<void>();
  readonly sendInvoiceEmail = output<string>();
  readonly printWorkOrder = output<void>();
  readonly printMaintenanceRecord = output<void>();
  readonly openLinkedWorkOrder = output<string>();

  protected readonly tabs: Array<{ value: WorkOrderReviewTab; label: string; icon: string }> = [
    { value: 'SUMMARY', label: 'Summary', icon: 'pi pi-file' },
    { value: 'WORKERS', label: 'Workers', icon: 'pi pi-users' },
    { value: 'EVIDENCE', label: 'Evidence', icon: 'pi pi-camera' },
    { value: 'RESOURCES', label: 'Resources', icon: 'pi pi-box' },
    { value: 'INVOICE', label: 'Invoice', icon: 'pi pi-receipt' },
    { value: 'COMMUNICATION', label: 'Comms', icon: 'pi pi-envelope' },
    { value: 'TIME', label: 'Timeline', icon: 'pi pi-clock' },
    { value: 'AUDIT', label: 'Audit', icon: 'pi pi-history' }
  ];
  protected readonly activeTab = signal<WorkOrderReviewTab>('SUMMARY');
  protected readonly auditGroupTab = signal<AuditGroupTab>('WORKER');
  protected readonly evidencePreviewOpen = signal(false);
  protected readonly evidencePreviewIndex = signal(0);
  protected readonly selectedEvidence = signal<WorkOrderEvidence | null>(null);
  protected reviewNote = '';

  constructor() {
    effect(() => {
      this.activeTab.set(this.initialTab());
      if (this.initialTab() === 'AUDIT') {
        this.auditGroupTab.set('WORKER');
      }
    });
  }

  protected approve(): void {
    this.reviewAction.emit({ action: 'APPROVE', note: this.reviewNote.trim() || undefined });
  }

  protected approveAndInvoice(): void {
    this.reviewAction.emit({ action: 'APPROVE_AND_INVOICE', note: this.reviewNote.trim() || undefined });
  }

  protected sendBack(): void {
    this.reviewAction.emit({ action: 'SEND_BACK', note: this.reviewNote.trim() });
  }

  protected overrideComplete(): void {
    this.reviewAction.emit({ action: 'OVERRIDE_COMPLETE', note: this.reviewNote.trim() });
  }

  protected tasksFor(data: WorkOrderReview, phase: 'PRE_START' | 'COMPLETION') {
    return data.workOrder.tasks.filter((task) => task.phase === phase);
  }

  protected usedMaterialCount(data: WorkOrderReview): number {
    return data.workOrder.materials.filter((material) => material.used).length;
  }

  protected receiptEvidence(data: WorkOrderReview): WorkOrderEvidence[] {
    return data.evidence.filter((item) => item.documentType === 'PURCHASE_RECEIPT');
  }

  protected completionCommunications(data: WorkOrderReview): WorkOrderCommunication[] {
    return data.communications.filter((item) => item.communicationType === 'WORK_ORDER_COMPLETION');
  }

  protected invoiceCommunications(data: WorkOrderReview): WorkOrderCommunication[] {
    return data.communications.filter((item) => item.communicationType === 'INVOICE_EMAIL');
  }

  protected failedCommunications(data: WorkOrderReview): WorkOrderCommunication[] {
    return data.communications.filter((item) => item.status === 'FAILED');
  }

  protected communicationLabel(item: WorkOrderCommunication): string {
    if (item.communicationType === 'INVOICE_EMAIL') {
      return 'Invoice email';
    }
    if (item.communicationType === 'WORK_ORDER_COMPLETION') {
      return 'Completion notice';
    }
    return 'Owner email';
  }

  protected communicationSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'SENT') {
      return 'success';
    }
    if (status === 'FAILED') {
      return 'danger';
    }
    if (status === 'RECORDED') {
      return 'info';
    }
    return 'secondary';
  }

  protected canNotifyOwner(data: WorkOrderReview): boolean {
    return ['APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED'].includes(data.workOrder.status);
  }

  protected workerSummaries(data: WorkOrderReview): WorkOrderWorkerSummary[] {
    return data.workOrder.assignments.map((assignment) => {
      const notes = data.fieldNotes.filter((note) =>
        workerMatches(assignment, { workerId: note.workerId, email: note.workerEmail, name: note.workerName })
      );
      const evidence = data.evidence.filter((item) =>
        workerMatches(assignment, { workerId: item.workerId, email: item.createdByEmail, name: item.createdByName })
      );
      const timeEntries = data.timeEntries.filter((entry) =>
        workerMatches(assignment, { workerId: entry.workerId, name: entry.workerName })
      );
      const auditEntries = this.workerAuditEntries(data).filter((audit) =>
        workerMatches(assignment, {
          workerId: stringValue(audit.metadata?.['workerId']),
          email: audit.actorEmail || stringValue(audit.metadata?.['workerEmail']),
          name: audit.actorName || stringValue(audit.metadata?.['workerName'])
        })
      );
      const tasks = data.workOrder.tasks.filter((task) => !task.assignedWorkerId || task.assignedWorkerId === assignment.workerId);
      const materialEvents = auditEntries.filter((audit) => audit.action === 'WORKER_MATERIAL_USED');
      const totalWorkMinutes = timeEntries
        .filter((entry) => entry.entryType !== 'SHIFT_CLOCK')
        .reduce((sum, entry) => sum + (entry.durationMinutes ?? 0), 0);
      return { assignment, notes, evidence, timeEntries, tasks, auditEntries, materialEvents, totalWorkMinutes };
    });
  }

  protected recordTitle(record: WorkOrderMaintenanceRecord): string {
    return record.templateSnapshot?.title || 'Maintenance record';
  }

  protected maintenanceRecords(data: WorkOrderReview): WorkOrderMaintenanceRecord[] {
    return data.maintenanceRecords ?? [];
  }

  protected recordSummary(record: WorkOrderMaintenanceRecord): string {
    const checks = Object.values(record.recordData?.serviceChecks ?? {}).filter(Boolean).length;
    const deliveries = Object.values(record.recordData?.deliveries ?? {}).filter((value) => String(value ?? '').trim()).length;
    return `${checks} checks · ${deliveries} deliveries`;
  }

  protected completedTaskCount(tasks: WorkOrderTask[]): number {
    return tasks.filter((task) => task.completed).length;
  }

  protected minutesLabel(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  protected workerMaterialLabel(audit: WorkOrderAuditEntry): string {
    const metadata = audit.metadata ?? {};
    const itemName = stringValue(metadata['itemName']) || stringValue(metadata['description']) || 'Material used';
    const quantity = stringValue(metadata['quantity']);
    const unit = stringValue(metadata['unit']);
    return [itemName, [quantity, unit].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  }

  protected evidenceLabel(item: WorkOrderEvidence): string {
    return item.documentType === 'PURCHASE_RECEIPT'
      ? 'Purchase receipt'
      : `${(item.photoType || 'OTHER').toLowerCase()} photo`;
  }

  protected evidenceTypeLabel(item: WorkOrderEvidence): string {
    if (item.contentType?.includes('/')) {
      return item.contentType.split('/').pop() || 'file';
    }
    return item.documentType === 'PURCHASE_RECEIPT' ? 'receipt' : 'photo';
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

  protected openEvidence(index: number): void {
    const evidence = this.review()?.evidence ?? [];
    this.evidencePreviewIndex.set(index);
    this.selectedEvidence.set(evidence[index] ?? null);
    this.evidencePreviewOpen.set(true);
  }

  protected evidenceIndex(data: WorkOrderReview, item: WorkOrderEvidence): number {
    const index = data.evidence.findIndex((candidate) => candidate.documentId === item.documentId && candidate.createdAt === item.createdAt);
    return index >= 0 ? index : 0;
  }

  protected closeEvidencePreview(): void {
    this.evidencePreviewOpen.set(false);
    this.selectedEvidence.set(null);
  }

  protected moveEvidence(delta: number): void {
    const evidence = this.review()?.evidence ?? [];
    const count = evidence.length;
    if (count <= 0) {
      return;
    }
    const nextIndex = (this.evidencePreviewIndex() + delta + count) % count;
    this.evidencePreviewIndex.set(nextIndex);
    this.selectedEvidence.set(evidence[nextIndex] ?? null);
  }

  protected actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action.toLowerCase().replaceAll('_', ' ');
  }

  protected timelineEntries(data: WorkOrderReview): WorkOrderAuditEntry[] {
    return [...data.auditLogs].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  protected operationalTimelineEntries(data: WorkOrderReview): WorkOrderAuditEntry[] {
    return this.timelineEntries(data).filter((audit) => isWorkerOperationalTimelineAction(audit.action));
  }

  protected workerAuditEntries(data: WorkOrderReview): WorkOrderAuditEntry[] {
    return data.auditLogs.filter((audit) => this.isWorkerAudit(audit));
  }

  protected tenantAuditEntries(data: WorkOrderReview): WorkOrderAuditEntry[] {
    return data.auditLogs.filter((audit) => !this.isWorkerAudit(audit));
  }

  protected isWorkerAudit(audit: WorkOrderAuditEntry): boolean {
    return audit.action.startsWith('WORKER_');
  }

  protected timeEntryLabel(entryType: string): string {
    if (entryType === 'SHIFT_CLOCK') {
      return 'Clocked in';
    }
    return entryType.toLowerCase().replaceAll('_', ' ');
  }

  protected timelineIcon(action: string): string {
    if (action.includes('VIEWED')) {
      return 'pi pi-eye';
    }
    if (action.includes('CHECKLIST')) {
      return 'pi pi-check-circle';
    }
    if (action.includes('PHOTO')) {
      return 'pi pi-camera';
    }
    if (action.includes('RECEIPT') || action.includes('INVOICE')) {
      return 'pi pi-receipt';
    }
    if (action.includes('MATERIAL') || action.includes('ASSET') || action.includes('TOOL')) {
      return 'pi pi-box';
    }
    if (action.includes('TRAVEL')) {
      return 'pi pi-map';
    }
    if (action.includes('ARRIVE')) {
      return 'pi pi-map-marker';
    }
    if (action.includes('APPROVED')) {
      return 'pi pi-verified';
    }
    if (action.includes('SENT_BACK') || action.includes('EMERGENCY')) {
      return 'pi pi-exclamation-triangle';
    }
    return 'pi pi-history';
  }

  protected auditSummary(audit: WorkOrderAuditEntry): string {
    const metadata = audit.metadata ?? {};
    const worker = stringValue(metadata['workerName']);
    const note = stringValue(metadata['note']) || stringValue(metadata['reason']);
    const label = stringValue(metadata['label']);
    const status = stringValue(metadata['status']) || stringValue(metadata['workOrderStatus']);
    const task = stringValue(metadata['taskLabel']);
    const material = stringValue(metadata['itemName']) || stringValue(metadata['description']);
    const invoice = stringValue(metadata['invoiceNumber']);
    const changedFields = displayValue(metadata['changedFields']);
    const changes = displayValue(metadata['changes']);
    const before = displayValue(metadata['before']);
    const after = displayValue(metadata['after']);
    if (audit.action.startsWith('WORKER_VIEWED_')) {
      return `${worker || audit.actorName || 'Worker'} viewed ${label || this.actionLabel(audit.action).replace('worker viewed ', '')}.`;
    }
    if (audit.action === 'WORKER_CHECKLIST_COMPLETED') {
      return `${worker || audit.actorName || 'Worker'} completed a checklist item${task ? ': ' + task : ''}.`;
    }
    if (audit.action === 'WORKER_MATERIAL_USED') {
      return `${worker || audit.actorName || 'Worker'} marked material used${material ? ': ' + material : ''}.`;
    }
    if (audit.action === 'WORKER_COMPLETE_WORK') {
      return `${worker || audit.actorName || 'Worker'} submitted the work for operations review.`;
    }
    if (audit.action === 'WORK_ORDER_APPROVED') {
      return `Operations approved the completed work${note ? ': ' + note : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_OWNER_NOTIFICATION_SENT') {
      const recipient = stringValue(metadata['recipientEmail']);
      return `Owner completion notification ${recipient ? 'recorded for ' + recipient : 'recorded'}.`;
    }
    if (audit.action === 'WORK_ORDER_OWNER_NOTIFICATION_FAILED') {
      const reason = stringValue(metadata['reason']);
      return `Owner completion notification failed${reason ? ': ' + reason : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_CUSTOMER_NOTIFIED') {
      const recipient = stringValue(metadata['recipientEmail']);
      return `Owner was notified that work is complete${recipient ? ': ' + recipient : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_SENT_BACK') {
      return `Operations sent the work back for correction${note ? ': ' + note : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_INVOICE_GENERATED') {
      const materialLineCount = stringValue(metadata['materialLineCount']);
      return `Draft invoice${invoice ? ' ' + invoice : ''} was generated from the approved work order${materialLineCount ? ' with ' + materialLineCount + ' material line(s)' : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_UPDATED') {
      return `Work order details updated${changedFields ? ': ' + changedFields : ''}${changes ? ' (' + changes + ')' : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_ASSIGNMENTS_UPDATED') {
      return `Assigned workers changed${before || after ? ': ' + before + ' -> ' + after : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_MATERIALS_UPDATED') {
      return `Materials changed${before || after ? ': ' + before + ' -> ' + after : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_ASSETS_UPDATED') {
      return `Tools and equipment changed${before || after ? ': ' + before + ' -> ' + after : ''}.`;
    }
    if (audit.action === 'WORK_ORDER_TASKS_UPDATED') {
      return `Checklist changed${before || after ? ': ' + before + ' -> ' + after : ''}.`;
    }
    if (status) {
      return `Status changed to ${status.toLowerCase().replaceAll('_', ' ')}${note ? ': ' + note : ''}.`;
    }
    return note || `${this.actionLabel(audit.action)} recorded.`;
  }

  protected statusLabel(status: string): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected workOrderTypeLabel(type: WorkOrderType | undefined): string {
    switch (type) {
      case 'PICKUP_DELIVERY':
        return 'pickup';
      case 'INSPECTION':
        return 'inspection';
      case 'FOLLOW_UP':
        return 'follow-up';
      default:
        return 'service';
    }
  }

  protected workOrderTypeClass(type: WorkOrderType | undefined): string {
    const base = 'rounded-full border px-2 py-0.5 text-[0.68rem] font-black uppercase';
    switch (type) {
      case 'PICKUP_DELIVERY':
        return `${base} border-amber-200 bg-amber-50 text-amber-700`;
      case 'INSPECTION':
        return `${base} border-violet-200 bg-violet-50 text-violet-700`;
      case 'FOLLOW_UP':
        return `${base} border-sky-200 bg-sky-50 text-sky-700`;
      default:
        return `${base} border-teal-200 bg-teal-50 text-teal-700`;
    }
  }

  protected routeStopTypeLabel(stopType: string): string {
    return stopType.toLowerCase().replaceAll('_', ' ');
  }

  protected routeStopStatusLabel(stop: WorkOrderRouteStop): string {
    if (stop.completedAt) {
      return 'Done';
    }
    if (stop.skippedAt) {
      return 'Skipped';
    }
    if (stop.arrivedAt) {
      return 'Arrived';
    }
    return 'Open';
  }

  protected routeStopStatusClass(stop: WorkOrderRouteStop): string {
    const base = 'rounded-full px-2 py-1 text-xs font-black';
    if (stop.completedAt) {
      return `${base} bg-green-100 text-green-700`;
    }
    if (stop.skippedAt) {
      return `${base} bg-amber-100 text-amber-700`;
    }
    if (stop.arrivedAt) {
      return `${base} bg-teal-100 text-teal-700`;
    }
    return `${base} bg-slate-100 text-slate-600`;
  }

  protected linkTypeLabel(linkType: string): string {
    return linkType.toLowerCase().replaceAll('_', ' ');
  }

  protected linkRelationshipLabel(link: WorkOrderLink, direction: 'outbound' | 'inbound'): string {
    switch (link.linkType) {
      case 'PICKUP_FOR':
        return direction === 'outbound' ? 'pickup for' : 'pickup job';
      case 'BLOCKS':
        return direction === 'outbound' ? 'blocks' : 'blocked by';
      case 'FOLLOWS':
        return direction === 'outbound' ? 'follows' : 'follow-up';
      case 'SAME_RECURRENCE':
        return 'same recurrence';
      default:
        return 'related';
    }
  }

  protected canGenerateInvoice(data: WorkOrderReview): boolean {
    return ['APPROVED', 'CUSTOMER_NOTIFIED'].includes(data.workOrder.status);
  }

  protected canOverrideComplete(data: WorkOrderReview): boolean {
    return !['PENDING_COMPLETION', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED'].includes(data.workOrder.status);
  }

  protected statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'APPROVED' || status === 'CUSTOMER_NOTIFIED' || status === 'COMPLETED' || status === 'PAID') {
      return 'success';
    }
    if (status === 'PENDING_COMPLETION' || status === 'ON_HOLD' || status === 'PAUSED') {
      return 'warn';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  protected assignmentSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (['COMPLETED', 'SUBMITTED', 'RELEASED'].includes(status)) {
      return 'success';
    }
    if (['PAUSED', 'LEFT_EMERGENCY'].includes(status)) {
      return 'warn';
    }
    if (status === 'CANCELLED') {
      return 'danger';
    }
    return 'info';
  }

  protected metadataEntries(audit: WorkOrderAuditEntry): Array<{ key: string; value: string }> {
    const metadata = audit.metadata ?? {};
    const entries = Object.entries(metadata)
      .filter(([key]) => !HIDDEN_AUDIT_KEYS.has(key))
      .map(([key, value]) => ({ key: FIELD_LABELS[key] ?? sentenceLabel(key), value: displayValue(value) }))
      .filter((entry) => entry.value.length > 0);
    if (metadata['latitude'] && metadata['longitude']) {
      entries.push({ key: 'Location', value: 'Captured' });
    }
    return entries.slice(0, 8);
  }

  protected currency(value: string | number): string {
    const amount = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(amount)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  }
}

const HIDDEN_AUDIT_KEYS = new Set([
  'userAgent',
  'workerId',
  'workerEmail',
  'taskId',
  'materialId',
  'inventoryItemId',
  'documentId',
  'assetId',
  'latitude',
  'longitude',
  'locationAccuracyMeters',
  'platform'
]);

const FIELD_LABELS: Record<string, string> = {
  actionAt: 'Action time',
  viewedAt: 'Viewed',
  changes: 'Changes',
  changedFields: 'Fields',
  before: 'Before',
  after: 'After',
  workerName: 'Worker',
  assignmentStatus: 'Assignment',
  workOrderStatus: 'Work order',
  status: 'Status',
  note: 'Note',
  reason: 'Reason',
  photoType: 'Photo',
  vendorName: 'Vendor',
  receiptAmount: 'Receipt total',
  caption: 'Caption',
  quantity: 'Quantity',
  unit: 'Unit',
  itemName: 'Item',
  description: 'Description',
  invoiceNumber: 'Invoice',
  total: 'Total',
  subtotal: 'Subtotal',
  taxTotal: 'Tax',
  lineCount: 'Lines',
  serviceLineCount: 'Service lines',
  materialLineCount: 'Material lines',
  lineDescriptions: 'Invoice lines'
};

const ACTION_LABELS: Record<string, string> = {
  WORKER_START_TRAVEL: 'Travel started',
  WORKER_ARRIVE_ON_SITE: 'Arrived on site',
  WORKER_START_WORK: 'Work started',
  WORKER_PAUSE_WORK: 'Work paused',
  WORKER_RESUME_WORK: 'Work resumed',
  WORKER_COMPLETE_WORK: 'Submitted for review',
  WORKER_CHECKLIST_COMPLETED: 'Checklist completed',
  WORKER_MATERIAL_USED: 'Material used',
  WORKER_TOOL_RETURNED: 'Tool returned',
  WORKER_PHOTO_CAPTURED: 'Photo uploaded',
  WORKER_PURCHASE_RECEIPT_UPLOADED: 'Receipt uploaded',
  WORKER_NOTE_ADDED: 'Field note added',
  WORKER_NOTE_UPDATED: 'Field note updated',
  WORKER_LEFT_EMERGENCY: 'Emergency leave',
  WORKER_VIEWED_DISPATCH: 'Dispatch viewed',
  WORKER_VIEWED_PRE_START_CHECKLIST: 'Pre-start checklist viewed',
  WORKER_VIEWED_COMPLETION_CHECKLIST: 'Completion checklist viewed',
  WORKER_VIEWED_TIMELINE: 'Timeline viewed',
  WORK_ORDER_CREATED: 'Work order created',
  WORK_ORDER_UPDATED: 'Work order updated',
  WORK_ORDER_ASSIGNMENTS_UPDATED: 'Assignments updated',
  WORK_ORDER_MATERIALS_UPDATED: 'Materials updated',
  WORK_ORDER_ASSETS_UPDATED: 'Tools updated',
  WORK_ORDER_TASKS_UPDATED: 'Checklist updated',
  WORK_ORDER_RECURRING_DRAFT_CREATED: 'Recurring draft created',
  WORK_ORDER_APPROVED: 'Work approved',
  WORK_ORDER_OWNER_NOTIFICATION_SENT: 'Owner notified',
  WORK_ORDER_OWNER_NOTIFICATION_FAILED: 'Owner notification failed',
  WORK_ORDER_CUSTOMER_NOTIFIED: 'Customer notified',
  WORK_ORDER_SENT_BACK: 'Sent back',
  WORK_ORDER_OVERRIDE_COMPLETED: 'Override completed',
  WORK_ORDER_FIELD_OVERRIDE_APPLIED: 'Field data override',
  WORK_ORDER_INVOICE_GENERATED: 'Invoice generated'
};

const WORKER_OPERATIONAL_TIMELINE_ACTIONS = new Set([
  'WORKER_START_TRAVEL',
  'WORKER_ARRIVE_ON_SITE',
  'WORKER_START_WORK',
  'WORKER_PAUSE_WORK',
  'WORKER_RESUME_WORK',
  'WORKER_CHECKLIST_COMPLETED',
  'WORKER_MATERIAL_USED',
  'WORKER_TOOL_RETURNED',
  'WORKER_PHOTO_CAPTURED',
  'WORKER_PURCHASE_RECEIPT_UPLOADED',
  'WORKER_NOTE_ADDED',
  'WORKER_NOTE_UPDATED',
  'WORKER_LEFT_EMERGENCY',
  'WORKER_COMPLETE_WORK'
]);

function isWorkerOperationalTimelineAction(action: string): boolean {
  return WORKER_OPERATIONAL_TIMELINE_ACTIONS.has(action);
}

function workerMatches(assignment: WorkOrderAssignment, candidate: { workerId?: string; email?: string; name?: string }): boolean {
  if (candidate.workerId && candidate.workerId === assignment.workerId) {
    return true;
  }
  if (candidate.email && assignment.workerEmail && candidate.email.toLowerCase() === assignment.workerEmail.toLowerCase()) {
    return true;
  }
  return Boolean(candidate.name && candidate.name === assignment.workerName);
}

function sentenceLabel(value: string): string {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replaceAll('_', ' ')
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function displayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'none';
    }
    return value
      .slice(0, 3)
      .map((item) => displayArrayItem(item))
      .filter(Boolean)
      .join('; ')
      .concat(value.length > 3 ? ` +${value.length - 3} more` : '');
  }
  if (typeof value === 'object') {
    return displayRecord(value as Record<string, unknown>);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (typeof value === 'string') {
    return prettifyValue(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }
  return String(value).replaceAll('_', ' ');
}

function displayArrayItem(value: unknown): string {
  if (!isRecord(value)) {
    return displayValue(value);
  }
  const name = [
    value['workerName'],
    value['itemName'],
    value['name'],
    value['label'],
    value['description'],
    value['propertyName'],
    value['title']
  ].map(displayValue).find(Boolean);
  const status = displayValue(value['assignmentStatus'] ?? value['taskStatus'] ?? value['status']);
  const role = value['leadWorker'] === true ? 'lead' : displayValue(value['assignmentRole'] ?? value['assetType']);
  return [name || compactRecord(value), role, status].filter(Boolean).join(' · ');
}

function displayRecord(record: Record<string, unknown>): string {
  if ('before' in record || 'after' in record) {
    return `${displayValue(record['before']) || 'empty'} -> ${displayValue(record['after']) || 'empty'}`;
  }
  const entries = Object.entries(record)
    .filter(([key, value]) => !HIDDEN_AUDIT_KEYS.has(key) && !key.toLowerCase().endsWith('id') && value !== undefined && value !== null)
    .slice(0, 4)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? sentenceLabel(key)}: ${displayValue(value)}`)
    .filter((entry) => !entry.endsWith(': '));
  return entries.join('; ');
}

function compactRecord(record: Record<string, unknown>): string {
  return Object.entries(record)
    .filter(([key, value]) => !HIDDEN_AUDIT_KEYS.has(key) && !key.toLowerCase().endsWith('id') && value !== undefined && value !== null)
    .slice(0, 2)
    .map(([key, value]) => `${FIELD_LABELS[key] ?? sentenceLabel(key)} ${displayValue(value)}`)
    .join(', ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function prettifyValue(value: string): string {
  if (value.includes('_')) {
    return value.replaceAll('_', ' ').toLowerCase();
  }
  return value;
}
