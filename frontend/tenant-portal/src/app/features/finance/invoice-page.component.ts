import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BulkInvoiceOwnerGroupRecord, BulkInvoicePreviewRecord, BulkInvoiceWorkOrderRecord, EmailTemplateRecord, InventoryItem, InvoiceLineRecord, InvoiceLineRequest, InvoiceRecord, InvoiceStatus, InvoiceWorkOrderRecord, OwnerStatementRecord, PropertyOwner, PropertyRecord, TenantSettingsRecord, WorkOrderRecord } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { InvoiceService } from './services/invoice.service';
import { EmailTemplateService } from '../notifications/services/email-template.service';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';
import { TenantAccessService } from '../../core/services/tenant-access.service';
import { TenantAnalyticsService } from '../analytics/services/tenant-analytics.service';

type InvoiceLineType = 'LABOR' | 'MATERIAL' | 'CUSTOM' | 'DISCOUNT';
type PaymentMethod = 'CASH' | 'CHEQUE' | 'E_TRANSFER' | 'CARD' | 'BANK_TRANSFER' | 'OTHER';
type BatchLineDraft = InvoiceLineRequest & { id: string; taxRatePercent?: number; inventoryItemId?: string };

@Component({
  selector: 'lorne-invoice-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, SelectModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Finance" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Invoices</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ invoices().length }} records</span>
            <span class="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{{ currency(receivables()) }} due</span>
            <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">{{ currency(paidTotal()) }} paid</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <label class="relative min-w-64 flex-1 sm:flex-none">
              <span class="sr-only">Search invoices</span>
              <i class="pi pi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input class="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm" type="search" placeholder="Invoice, owner, property, work order" [ngModel]="invoiceSearch()" (ngModelChange)="invoiceSearch.set($event)" />
              @if (invoiceSearch()) {
                <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700" title="Clear search" aria-label="Clear search" (click)="invoiceSearch.set('')"><i class="pi pi-times"></i></button>
              }
            </label>
            <button pButton type="button" icon="pi pi-plus" label="Create invoice" [disabled]="!canManageBilling()" (click)="openBatchInvoice()"></button>
            <button pButton type="button" severity="secondary" icon="pi pi-calendar-plus" label="Bulk by date" [disabled]="!canManageBilling()" (click)="openBulkInvoice()"></button>
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_30rem]">
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[70rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">Invoice</th>
                  <th class="px-3 py-3">Owner</th>
                  <th class="px-3 py-3">Property</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3">Due</th>
                  <th class="px-3 py-3 text-right">Paid</th>
                  <th class="px-3 py-3 text-right">Balance</th>
                  <th class="w-28 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (invoice of filteredInvoices(); track invoice.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [class.bg-teal-50]="selectedInvoice()?.id === invoice.id" (click)="select(invoice)">
                    <td class="px-3 py-3">
                      <p class="font-black text-slate-950">{{ invoice.invoiceNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ invoiceWorkSummary(invoice) }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-800">{{ invoice.ownerName }}</p>
                      @if (invoice.ownerCode) {
                        <p class="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[0.68rem] font-black uppercase tracking-wide text-teal-700">{{ invoice.ownerCode }}</p>
                      }
                      <p class="text-xs text-slate-500">{{ invoice.ownerBillingEmail || invoice.ownerEmail || 'No billing email' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-teal-700">{{ invoicePropertySummary(invoice) }}</p>
                      @if (invoice.propertyCode) {
                        <p class="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[0.68rem] font-black uppercase tracking-wide text-slate-600">{{ invoice.propertyCode }}</p>
                      }
                      <p class="line-clamp-1 text-xs text-slate-500">{{ invoiceWorkSummary(invoice) }}</p>
                    </td>
                    <td class="px-3 py-3"><p-tag [value]="statusText(invoice.status)" [severity]="statusSeverity(invoice.status)" /></td>
                    <td class="px-3 py-3 text-slate-600">{{ invoice.dueOn || '-' }}</td>
                    <td class="px-3 py-3 text-right font-semibold text-slate-600">{{ currency(invoice.paidTotal) }}</td>
                    <td class="px-3 py-3 text-right font-black text-slate-950">{{ currency(invoice.balanceDue) }}</td>
                    <td class="px-3 py-3">
                      <div class="flex items-center justify-end gap-1">
                        <button pButton type="button" size="small" text rounded icon="pi pi-print" class="!h-8 !w-8 shrink-0" title="Print invoice" aria-label="Print invoice" (click)="printInvoice(invoice); $event.stopPropagation()"></button>
                        <button pButton type="button" size="small" text rounded icon="pi pi-download" class="!h-8 !w-8 shrink-0" title="Download PDF" aria-label="Download PDF" (click)="downloadPdf(invoice); $event.stopPropagation()"></button>
                        <button pButton type="button" size="small" text rounded icon="pi pi-send" class="!h-8 !w-8 shrink-0" title="Email owner" aria-label="Email owner" [disabled]="!canManageBilling() || !ownerEmail(invoice)" (click)="openSend(invoice); $event.stopPropagation()"></button>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">{{ invoiceSearch() ? 'No invoices match this search.' : 'No invoices generated yet.' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <aside class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          @if (selectedInvoice(); as invoice) {
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Invoice detail</p>
                <h2 class="mt-1 text-xl font-black text-slate-950">{{ invoice.invoiceNumber }}</h2>
                <p class="text-sm font-semibold text-slate-500">{{ invoice.ownerName }}</p>
              </div>
              <p-tag [value]="statusText(invoice.status)" [severity]="statusSeverity(invoice.status)" />
            </div>
            <div class="mt-3 grid grid-cols-3 gap-2">
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-list" label="Statement" (click)="openStatement(invoice)"></button>
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-send" label="Send invoice" [disabled]="!canManageBilling() || invoice.status !== 'DRAFT' || !ownerEmail(invoice)" (click)="openSend(invoice)"></button>
              <button pButton type="button" size="small" severity="danger" icon="pi pi-ban" label="Void" [disabled]="!canManageBilling() || invoice.status === 'VOID' || invoice.status === 'PAID'" [loading]="savingStatus()" (click)="voidInvoice(invoice)"></button>
            </div>
            @if (!canManageBilling()) {
              <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                {{ billingDeniedMessage }}
              </p>
            }
            <div class="mt-3 grid gap-2">
              @if (invoice.workOrders.length > 1) {
                <div class="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <p class="text-xs font-black uppercase tracking-wide text-blue-700">Included work orders</p>
                  <div class="mt-2 grid gap-2">
                    @for (workOrder of invoice.workOrders; track workOrder.workOrderId) {
                      <div class="rounded-md bg-white px-2.5 py-2 text-xs">
                        <p class="font-black text-slate-950">{{ workOrder.workOrderNumber }} · {{ workOrder.title }}</p>
                        <p class="mt-0.5 font-semibold text-slate-500">{{ workOrder.propertyName || 'No property' }} @if (workOrder.serviceName) { · {{ workOrder.serviceName }} }</p>
                        @if (workOrder.propertyCode) {
                          <p class="mt-1 font-mono text-[0.68rem] font-black uppercase tracking-wide text-teal-700">{{ workOrder.propertyCode }}</p>
                        }
                      </div>
                    }
                  </div>
                </div>
              }
              @for (line of invoice.lines; track line.id) {
                @if (editingLineId() === line.id) {
                  <form class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2" (ngSubmit)="updateLine(invoice, line)">
                    <div class="grid gap-2 sm:grid-cols-[7rem_1fr]">
                      <label class="block">
                        <span class="mb-1 block text-xs font-bold text-slate-700">Type</span>
                        <select class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" name="editLineType{{ line.id }}" [(ngModel)]="lineEditForm.lineType">
                          <option value="LABOR">Labor</option>
                          <option value="MATERIAL">Material</option>
                          <option value="CUSTOM">Custom</option>
                          <option value="DISCOUNT">Discount</option>
                        </select>
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-bold text-slate-700">Description</span>
                        <input class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" name="editLineDescription{{ line.id }}" [(ngModel)]="lineEditForm.description" />
                      </label>
                    </div>
                    <div class="mt-2 grid gap-2 sm:grid-cols-[6rem_8rem_6rem_1fr] sm:items-end">
                      <label class="block">
                        <span class="mb-1 block text-xs font-bold text-slate-700">Qty</span>
                        <input class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" min="0.01" step="0.01" name="editLineQuantity{{ line.id }}" [(ngModel)]="lineEditForm.quantity" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-bold text-slate-700">Billing cost</span>
                        <input class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" step="0.01" name="editLineUnitPrice{{ line.id }}" [(ngModel)]="lineEditForm.unitPrice" />
                      </label>
                      <label class="block">
                        <span class="mb-1 block text-xs font-bold text-slate-700">Tax %</span>
                        <input class="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" min="0" max="100" step="0.01" name="editLineTaxRate{{ line.id }}" [(ngModel)]="lineEditForm.taxRatePercent" />
                      </label>
                      <div class="flex flex-wrap items-center justify-end gap-2">
                        <label class="flex items-center gap-2 text-xs font-bold text-slate-700">
                          <input type="checkbox" name="editLineTaxable{{ line.id }}" [(ngModel)]="lineEditForm.taxable" />
                          Tax
                        </label>
                        <button pButton type="button" size="small" severity="secondary" label="Cancel" [disabled]="savingLine()" (click)="cancelEditLine()"></button>
                        <button pButton type="submit" size="small" icon="pi pi-save" label="Save" [loading]="savingLine()"></button>
                      </div>
                    </div>
                  </form>
                } @else {
                  <div class="grid gap-2 rounded-lg bg-slate-50 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-start">
                    <span>
                      <p class="text-sm font-black text-slate-950"><span class="mr-1 rounded-full bg-white px-2 py-0.5 text-[0.65rem] uppercase text-teal-700">{{ line.lineType.toLowerCase() }}</span>{{ line.description }}</p>
                      <p class="mt-1 text-xs font-semibold text-slate-500">{{ line.quantity }} x {{ currency(line.unitPrice) }} @if (line.taxable) { · tax {{ percent(line.taxRate) }} }</p>
                      <p class="mt-1 text-sm font-black text-slate-800">{{ currency(line.lineTotal) }}</p>
                    </span>
                    @if (invoice.status === 'DRAFT') {
                      <div class="flex justify-end gap-1">
                        <button pButton type="button" size="small" severity="secondary" icon="pi pi-pencil" [text]="true" [disabled]="!canManageBilling() || savingLine()" (click)="startEditLine(line)"></button>
                        <button pButton type="button" size="small" severity="danger" icon="pi pi-trash" [text]="true" [disabled]="!canManageBilling() || savingLine()" (click)="deleteLine(invoice, line.id)"></button>
                      </div>
                    }
                  </div>
                }
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No line items.</p>
              }
            </div>
            @if (invoice.status === 'DRAFT' && canManageBilling()) {
              <form class="mt-3 rounded-lg border border-teal-100 bg-teal-50 p-3" (ngSubmit)="addLine(invoice)">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Add draft line</p>
                <div class="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Type</span>
                    <select class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" name="lineType" [(ngModel)]="lineForm.lineType">
                      <option value="LABOR">Labor</option>
                      <option value="MATERIAL">Material</option>
                      <option value="CUSTOM">Custom</option>
                      <option value="DISCOUNT">Discount</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Description</span>
                    <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" name="lineDescription" [(ngModel)]="lineForm.description" />
                  </label>
                </div>
                @if (lineForm.lineType === 'MATERIAL') {
                  <label class="mt-2 block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Inventory material</span>
                    <p-select
                      styleClass="w-full"
                      name="lineInventoryItem"
                      [options]="activeInventoryItems()"
                      optionLabel="name"
                      optionValue="id"
                      [filter]="true"
                      filterBy="name,categoryName,storageLocation,unit"
                      [showClear]="true"
                      appendTo="body"
                      placeholder="Search inventory or keep ad-hoc description"
                      [(ngModel)]="lineForm.inventoryItemId"
                      (ngModelChange)="applyInventoryToLineForm()"
                    />
                  </label>
                }
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Qty</span>
                    <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="0.01" step="0.01" name="lineQuantity" [(ngModel)]="lineForm.quantity" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Billing cost</span>
                    <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" step="0.01" name="lineUnitPrice" [(ngModel)]="lineForm.unitPrice" />
                  </label>
                  <label class="block">
                    <span class="mb-1 block text-xs font-bold text-slate-700">Tax %</span>
                    <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="0" max="100" step="0.01" name="lineTaxRate" [(ngModel)]="lineForm.taxRatePercent" />
                  </label>
                </div>
                <label class="mt-2 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input type="checkbox" name="lineTaxable" [(ngModel)]="lineForm.taxable" />
                  Taxable line
                </label>
                <button class="mt-2 w-full" pButton type="submit" size="small" icon="pi pi-plus" label="Add line" [loading]="savingLine()"></button>
              </form>
            }
            <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p class="flex justify-between text-sm"><span>Subtotal</span><strong>{{ currency(invoice.subtotal) }}</strong></p>
              <p class="mt-1 flex justify-between text-sm"><span>Tax</span><strong>{{ currency(invoice.taxTotal) }}</strong></p>
              <p class="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base"><span>Total</span><strong>{{ currency(invoice.total) }}</strong></p>
              <p class="mt-1 flex justify-between text-sm"><span>Paid</span><strong>{{ currency(invoice.paidTotal) }}</strong></p>
              <p class="mt-1 flex justify-between text-base"><span>Balance</span><strong>{{ currency(invoice.balanceDue) }}</strong></p>
            </div>
            <div class="mt-3 rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Payments</p>
                <button pButton type="button" size="small" icon="pi pi-credit-card" label="Record" [disabled]="!canManageBilling() || invoice.status === 'VOID' || invoice.balanceDue <= 0" (click)="openPayment(invoice)"></button>
              </div>
              <div class="mt-2 grid gap-2">
                @for (payment of invoice.payments; track payment.id) {
                  <div class="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <p class="flex justify-between gap-2 font-black text-slate-950"><span>{{ payment.paymentMethod.toLowerCase().replaceAll('_', ' ') }}</span><span>{{ currency(payment.amount) }}</span></p>
                    <p class="mt-1 text-xs font-semibold text-slate-500">{{ payment.paidAt ? dateTime(payment.paidAt) : '-' }} @if (payment.reference) { · {{ payment.reference }} }</p>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">No payments recorded.</p>
                }
              </div>
            </div>
            <div class="mt-3 grid gap-2">
              <button pButton type="button" icon="pi pi-print" label="Print invoice" (click)="printInvoice(invoice)"></button>
              <button pButton type="button" severity="secondary" icon="pi pi-download" label="Download PDF" [loading]="downloading()" (click)="downloadPdf(invoice)"></button>
              <button pButton type="button" severity="secondary" icon="pi pi-send" label="Email owner" [disabled]="!canManageBilling() || !ownerEmail(invoice)" (click)="openSend(invoice)"></button>
            </div>
          } @else {
            <p class="px-3 py-10 text-center text-sm font-semibold text-slate-500">Select an invoice to preview lines, print, or email the owner.</p>
          }
        </aside>
      </section>

      <p-dialog header="Email invoice" [modal]="true" [visible]="showSend()" [style]="{ width: 'min(46rem, 94vw)' }" (visibleChange)="showSend.set($event)">
        <form class="space-y-3" (ngSubmit)="sendInvoiceEmail()">
          <label class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">To</span>
            <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="recipientEmail" [(ngModel)]="sendForm.recipientEmail" />
          </label>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">CC</span>
              <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="ccEmails" placeholder="comma separated" [(ngModel)]="sendForm.ccEmails" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">BCC</span>
              <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="bccEmails" placeholder="comma separated" [(ngModel)]="sendForm.bccEmails" />
            </label>
          </div>
          <label class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Subject</span>
            <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="subject" [(ngModel)]="sendForm.subject" />
          </label>
          <div class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Message</span>
            <div class="min-h-64 w-full overflow-auto rounded border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100" contenteditable="true" role="textbox" aria-multiline="true" [innerHTML]="sendForm.body" (input)="updateSendBody($event)"></div>
            <span class="mt-1 block text-xs font-medium text-slate-500">The formatted message shown here is what the customer receives.</span>
          </div>
          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showSend.set(false)"></button>
            <button pButton type="submit" icon="pi pi-send" label="Send invoice" [disabled]="!canManageBilling()" [loading]="saving()"></button>
          </div>
        </form>
      </p-dialog>

      <p-dialog header="Record payment" [modal]="true" [visible]="showPayment()" [style]="{ width: 'min(36rem, 94vw)' }" (visibleChange)="showPayment.set($event)">
        <form class="space-y-3" (ngSubmit)="recordPayment()">
          @if (paymentTarget(); as invoice) {
            <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">Balance due: <strong>{{ currency(invoice.balanceDue) }}</strong></p>
          }
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Amount</span>
              <input class="w-full border border-slate-300 px-3 py-2 text-sm" type="number" min="0.01" step="0.01" name="paymentAmount" [(ngModel)]="paymentForm.amount" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Method</span>
              <select class="w-full border border-slate-300 px-3 py-2 text-sm" name="paymentMethod" [(ngModel)]="paymentForm.paymentMethod">
                <option value="E_TRANSFER">E-transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
          </div>
          <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="paymentReference" placeholder="Reference number" [(ngModel)]="paymentForm.reference" />
          <textarea class="min-h-24 w-full border border-slate-300 px-3 py-2 text-sm" name="paymentNote" placeholder="Payment note" [(ngModel)]="paymentForm.note"></textarea>
          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showPayment.set(false)"></button>
            <button pButton type="submit" icon="pi pi-check" label="Record payment" [disabled]="!canManageBilling()" [loading]="savingPayment()"></button>
          </div>
        </form>
      </p-dialog>

      <p-dialog header="Owner statement" [modal]="true" [visible]="showStatement()" [style]="{ width: 'min(60rem, 94vw)' }" (visibleChange)="showStatement.set($event)">
        @if (statement(); as owner) {
          <div class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Statement</p>
              <h3 class="text-xl font-black text-slate-950">{{ owner.ownerName }}</h3>
              <p class="text-sm font-semibold text-slate-500">{{ owner.ownerBillingEmail || owner.ownerEmail || 'No billing email' }}</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <p class="rounded-lg bg-white p-3 text-sm">Invoiced<br><strong>{{ currency(owner.invoicedTotal) }}</strong></p>
                <p class="rounded-lg bg-white p-3 text-sm">Paid<br><strong>{{ currency(owner.paidTotal) }}</strong></p>
                <p class="rounded-lg bg-white p-3 text-sm">Balance<br><strong>{{ currency(owner.balanceDue) }}</strong></p>
              </div>
            </div>
            <div class="max-h-[26rem] overflow-auto rounded-lg border border-slate-200">
              <table class="w-full min-w-[48rem] text-sm">
                <thead class="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                  <tr><th class="px-3 py-2">Invoice</th><th class="px-3 py-2">Status</th><th class="px-3 py-2">Due</th><th class="px-3 py-2 text-right">Total</th><th class="px-3 py-2 text-right">Balance</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (invoice of owner.invoices; track invoice.id) {
                    <tr><td class="px-3 py-2 font-bold">{{ invoice.invoiceNumber }}</td><td class="px-3 py-2">{{ statusText(invoice.status) }}</td><td class="px-3 py-2">{{ invoice.dueOn || '-' }}</td><td class="px-3 py-2 text-right">{{ currency(invoice.total) }}</td><td class="px-3 py-2 text-right font-black">{{ currency(invoice.balanceDue) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="flex justify-end">
              <button pButton type="button" icon="pi pi-print" label="Print statement" (click)="printStatement(owner)"></button>
            </div>
          </div>
        }
      </p-dialog>

      <p-dialog header="Create multi-work-order invoice" [modal]="true" [visible]="showBatchInvoice()" [style]="{ width: 'min(76rem, 96vw)', height: 'min(54rem, 94vh)' }" [contentStyle]="{ height: 'calc(100% - 3.75rem)', overflow: 'hidden' }" (visibleChange)="showBatchInvoice.set($event)">
        <form class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden" (ngSubmit)="createBatchInvoice()">
          <section class="grid gap-3 lg:grid-cols-[1fr_1fr_10rem_10rem]">
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Owner *</span>
              <p-select
                styleClass="w-full"
                name="batchOwnerId"
                [options]="owners()"
                optionLabel="displayName"
                optionValue="id"
                filterBy="displayName,email,billingEmail,phone,ownerCode"
                [filter]="true"
                [showClear]="true"
                appendTo="body"
                placeholder="Search owner"
                [(ngModel)]="batchForm.ownerId"
                (ngModelChange)="batchForm.propertyId = ''; batchForm.workOrderIds = []"
              >
                <ng-template pTemplate="item" let-owner>
                  <div>
                    <p class="font-bold text-slate-900">{{ owner.displayName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ owner.ownerCode }} · {{ owner.billingEmail || owner.email || 'No email' }}</p>
                  </div>
                </ng-template>
                <ng-template pTemplate="selectedItem" let-owner>
                  <span>{{ owner?.displayName || 'Search owner' }}</span>
                </ng-template>
              </p-select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Property</span>
              <p-select
                styleClass="w-full"
                name="batchPropertyId"
                [options]="filteredProperties()"
                optionLabel="name"
                optionValue="id"
                filterBy="name,addressLine1,city,propertyCode,ownerName,ownerCode"
                [filter]="true"
                [showClear]="true"
                appendTo="body"
                placeholder="All owner properties"
                [(ngModel)]="batchForm.propertyId"
                (ngModelChange)="batchForm.workOrderIds = []"
              >
                <ng-template pTemplate="item" let-property>
                  <div>
                    <p class="font-bold text-slate-900">{{ property.name }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ property.propertyCode }} · {{ property.addressLine1 }}</p>
                  </div>
                </ng-template>
                <ng-template pTemplate="selectedItem" let-property>
                  <span>{{ property?.name || 'All owner properties' }}</span>
                </ng-template>
              </p-select>
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Issued</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" name="batchIssuedOn" [(ngModel)]="batchForm.issuedOn" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Due</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" name="batchDueOn" [(ngModel)]="batchForm.dueOn" />
            </label>
          </section>

          <section class="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
            <div class="min-h-0 overflow-hidden rounded-lg border border-slate-200">
              <div class="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Ready work orders</p>
                  <p class="text-xs font-semibold text-slate-500">{{ batchCandidates().length }} available · {{ batchForm.workOrderIds.length }} selected</p>
                </div>
                <button pButton type="button" size="small" severity="secondary" label="Select all" [disabled]="batchCandidates().length === 0" (click)="selectAllBatchCandidates()"></button>
              </div>
              <div class="h-full min-h-[18rem] overflow-auto p-2">
                @for (workOrder of batchCandidates(); track workOrder.id) {
                  <label class="mb-2 grid cursor-pointer gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-teal-300 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                    <input class="mt-1" type="checkbox" [checked]="batchForm.workOrderIds.includes(workOrder.id)" (change)="toggleBatchWorkOrder(workOrder.id, $event)" />
                      <span>
                        <span class="block text-sm font-black text-slate-950">{{ workOrder.workOrderNumber }} · {{ workOrder.title }}</span>
                        <span class="mt-0.5 block text-xs font-semibold text-slate-500">{{ workOrder.propertyName }} · {{ workOrder.serviceName || 'General service' }}</span>
                        <span class="mt-1 block font-mono text-[0.68rem] font-black uppercase tracking-wide text-teal-700">
                          {{ workOrder.propertyCode || 'No property ID' }}
                        </span>
                      </span>
                    <span class="rounded-full bg-teal-50 px-2 py-1 text-xs font-black text-teal-700">{{ statusText(workOrder.status) }}</span>
                  </label>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm font-semibold text-slate-500">No approved, uninvoiced work orders match this owner/property.</p>
                }
              </div>
            </div>

            <div class="min-h-0 overflow-hidden rounded-lg border border-slate-200">
              <div class="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Additional items</p>
                  <p class="text-xs font-semibold text-slate-500">Optional custom, material, labor, or discount lines.</p>
                </div>
                <button pButton type="button" size="small" icon="pi pi-plus" label="Add item" (click)="addBatchLine()"></button>
              </div>
              <div class="h-full min-h-[18rem] overflow-auto p-2">
                @for (line of batchForm.additionalLines; track line.id) {
                  <div class="mb-2 rounded-lg border border-slate-200 bg-white p-2">
                    <div class="grid gap-2 sm:grid-cols-[7rem_1fr_auto]">
                      <select class="rounded-lg border border-slate-300 px-2 py-2 text-sm" name="batchLineType{{ line.id }}" [(ngModel)]="line.lineType">
                        <option value="CUSTOM">Custom</option>
                        <option value="LABOR">Labor</option>
                        <option value="MATERIAL">Material</option>
                        <option value="DISCOUNT">Discount</option>
                      </select>
                      <input class="rounded-lg border border-slate-300 px-2 py-2 text-sm" name="batchLineDescription{{ line.id }}" placeholder="Description" [(ngModel)]="line.description" />
                      <button pButton type="button" severity="danger" text rounded icon="pi pi-trash" (click)="removeBatchLine(line.id)"></button>
                    </div>
                    @if (line.lineType === 'MATERIAL') {
                      <p-select
                        styleClass="mt-2 w-full"
                        [options]="activeInventoryItems()"
                        optionLabel="name"
                        optionValue="id"
                        [filter]="true"
                        filterBy="name,categoryName,storageLocation,unit"
                        [showClear]="true"
                        appendTo="body"
                        placeholder="Search inventory or keep ad-hoc description"
                        [(ngModel)]="line.inventoryItemId"
                        [ngModelOptions]="{ standalone: true }"
                        (ngModelChange)="applyInventoryToBatchLine(line)"
                      />
                    }
                    <div class="mt-2 grid grid-cols-4 gap-2">
                      <input class="rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" min="0.01" step="0.01" name="batchLineQty{{ line.id }}" placeholder="Qty" [(ngModel)]="line.quantity" />
                      <input class="rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" step="0.01" name="batchLineUnit{{ line.id }}" placeholder="Billing cost" [(ngModel)]="line.unitPrice" />
                      <input class="rounded-lg border border-slate-300 px-2 py-2 text-sm" type="number" min="0" max="100" step="0.01" name="batchLineTax{{ line.id }}" placeholder="Tax %" [(ngModel)]="line.taxRatePercent" />
                      <label class="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-600">
                        <input type="checkbox" name="batchLineTaxable{{ line.id }}" [(ngModel)]="line.taxable" />
                        Tax
                      </label>
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm font-semibold text-slate-500">No additional items.</p>
                }
              </div>
            </div>
          </section>

          <div class="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <p class="text-sm font-bold text-slate-600">Creates one draft invoice. You can still edit lines before sending.</p>
            <div class="flex gap-2">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="showBatchInvoice.set(false)"></button>
              <button pButton type="submit" icon="pi pi-save" label="Create draft invoice" [disabled]="!canManageBilling() || batchForm.workOrderIds.length === 0" [loading]="savingBatch()"></button>
            </div>
          </div>
        </form>
      </p-dialog>

      <p-dialog header="Bulk invoice by date range" [modal]="true" [visible]="showBulkInvoice()" [style]="{ width: 'min(82rem, 96vw)', height: 'min(56rem, 94vh)' }" [contentStyle]="{ height: 'calc(100% - 3.75rem)', overflow: 'hidden' }" (visibleChange)="showBulkInvoice.set($event)">
        <form class="grid h-full min-h-0 grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-3 overflow-hidden" (ngSubmit)="createBulkInvoices()">
          <section class="grid gap-3 lg:grid-cols-[10rem_10rem_10rem_1fr_auto] lg:items-end">
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">From</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" name="bulkFromDate" [(ngModel)]="bulkForm.fromDate" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">To</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" name="bulkToDate" [(ngModel)]="bulkForm.toDate" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Issued</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="date" name="bulkIssuedOn" [(ngModel)]="bulkForm.issuedOn" />
            </label>
            <label class="block">
              <span class="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600">Search preview</span>
              <input class="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" name="bulkSearch" placeholder="Owner, property, work order, service" [(ngModel)]="bulkSearch" />
            </label>
            <button pButton type="button" severity="secondary" icon="pi pi-search" label="Preview" [loading]="loadingBulkPreview()" (click)="previewBulkInvoices()"></button>
          </section>

          <section class="grid gap-3 sm:grid-cols-4">
            <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span class="block text-xs font-black uppercase tracking-wide text-slate-500">Owners</span><strong>{{ bulkPreview()?.ownerCount || 0 }}</strong></p>
            <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span class="block text-xs font-black uppercase tracking-wide text-slate-500">Eligible work orders</span><strong>{{ bulkPreview()?.workOrderCount || 0 }}</strong></p>
            <p class="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800"><span class="block text-xs font-black uppercase tracking-wide">Selected</span><strong>{{ bulkForm.workOrderIds.length }} work orders</strong></p>
            <p class="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800"><span class="block text-xs font-black uppercase tracking-wide">Selected subtotal</span><strong>{{ currency(bulkSelectedSubtotal()) }}</strong></p>
          </section>
          <section class="grid gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900 md:grid-cols-3">
            <p><strong class="block text-blue-700">Owner row</strong>Select the owner checkbox to include every visible work order under that owner.</p>
            <p><strong class="block text-blue-700">Expand work orders</strong>Use the chevron to show jobs; use Remove to hide a job from this preview.</p>
            <p><strong class="block text-blue-700">Duplicate guard</strong>Already invoiced work orders are hidden here and rechecked when invoices are created.</p>
          </section>

          <section class="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white">
            <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-xs font-bold text-slate-600">Only approved/customer-notified work orders not already on a non-void invoice are shown.</p>
              <div class="flex gap-2">
                <button pButton type="button" size="small" severity="secondary" label="Select all visible" [disabled]="filteredBulkOwners().length === 0" (click)="selectAllBulkVisible()"></button>
                <button pButton type="button" size="small" severity="secondary" label="Clear" [disabled]="bulkForm.workOrderIds.length === 0" (click)="clearBulkSelection()"></button>
              </div>
            </div>
            <div class="grid gap-3 p-3">
              @if (loadingBulkPreview()) {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-12 text-center text-sm font-semibold text-slate-500">Loading eligible work orders...</p>
              } @else {
                @for (owner of filteredBulkOwners(); track owner.ownerId) {
                  <article class="overflow-hidden rounded-lg border border-slate-200">
                    <div class="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <label class="flex min-w-0 cursor-pointer items-start gap-3">
                        <input class="mt-1" type="checkbox" [checked]="bulkOwnerSelected(owner)" (change)="toggleBulkOwner(owner, $event)" />
                        <span class="min-w-0">
                          <span class="block font-black text-slate-950">{{ owner.ownerName }}</span>
                          <span class="block text-xs font-semibold text-slate-500">{{ owner.ownerCode || 'No owner ID' }} · {{ owner.ownerBillingEmail || owner.ownerEmail || 'No billing email' }}</span>
                        </span>
                      </label>
                      <span class="flex flex-wrap items-center gap-2 text-xs font-black">
                        <span class="rounded-full bg-white px-2 py-1 text-slate-600">{{ bulkOwnerSelectedCount(owner) }} / {{ owner.workOrderCount }} selected</span>
                        <span class="rounded-full bg-white px-2 py-1 text-slate-600">{{ owner.workOrderCount }} work orders</span>
                        <span class="rounded-full bg-teal-50 px-2 py-1 text-teal-700">{{ currency(owner.estimatedSubtotal) }}</span>
                        <button
                          pButton
                          type="button"
                          size="small"
                          severity="secondary"
                          [text]="true"
                          [icon]="bulkOwnerExpanded(owner) ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                          [label]="bulkOwnerExpanded(owner) ? 'Hide work orders' : 'Show work orders'"
                          [attr.aria-expanded]="bulkOwnerExpanded(owner)"
                          (click)="toggleBulkOwnerExpanded(owner.ownerId)"
                        ></button>
                      </span>
                    </div>
                    @if (bulkOwnerExpanded(owner)) {
                      <div class="divide-y divide-slate-100">
                        @for (workOrder of owner.workOrders; track workOrder.workOrderId) {
                          <div class="grid gap-2 px-3 py-2 hover:bg-slate-50 sm:grid-cols-[auto_1fr_auto] sm:items-start">
                            <input class="mt-1" type="checkbox" aria-label="Select work order" [checked]="bulkForm.workOrderIds.includes(workOrder.workOrderId)" (change)="toggleBulkWorkOrder(workOrder.workOrderId, $event)" />
                            <span class="min-w-0">
                              <span class="block text-sm font-black text-slate-950">{{ workOrder.workOrderNumber }} · {{ workOrder.title }}</span>
                              <span class="mt-0.5 block text-xs font-semibold text-slate-500">{{ workOrder.propertyName }} · {{ workOrder.propertyCode || 'No property ID' }} · {{ workOrder.serviceName || 'General service' }}</span>
                              @if (workOrder.propertyAddress) {
                                <span class="mt-0.5 block text-xs text-slate-500">{{ workOrder.propertyAddress }}</span>
                              }
                              <span class="mt-0.5 block text-xs text-slate-500">{{ serviceWindowText(workOrder) }}</span>
                            </span>
                            <span class="flex items-center justify-end gap-2">
                              <span class="text-right text-sm font-black text-slate-900">{{ currency(workOrder.estimatedSubtotal) }}</span>
                              <button pButton type="button" size="small" severity="secondary" text rounded icon="pi pi-times" label="Remove" title="Remove from preview" aria-label="Remove from preview" (click)="removeBulkWorkOrder(workOrder.workOrderId)"></button>
                            </span>
                          </div>
                        }
                      </div>
                    } @else {
                      <p class="border-t border-slate-100 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                        Work orders hidden. Click <strong>Show work orders</strong> to review and select individual jobs.
                      </p>
                    }
                  </article>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-12 text-center text-sm font-semibold text-slate-500">No eligible work orders found for this range.</p>
                }
              }
            </div>
          </section>

          <div class="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
            <p class="text-sm font-bold text-slate-600">Creates one draft invoice per owner. Work orders already invoiced are skipped by the server.</p>
            <div class="flex gap-2">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="showBulkInvoice.set(false)"></button>
              <button pButton type="submit" icon="pi pi-save" label="Create selected invoices" [disabled]="!canManageBilling() || bulkForm.workOrderIds.length === 0" [loading]="savingBulkInvoices()"></button>
            </div>
          </div>
        </form>
      </p-dialog>

    </section>
  `
})
export class InvoicePageComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly analyticsService = inject(TenantAnalyticsService);
  private readonly emailTemplateService = inject(EmailTemplateService);
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly access = inject(TenantAccessService);
  protected readonly canManageBilling = this.access.canManageBilling;
  protected readonly billingDeniedMessage = this.access.billingDeniedMessage;
  protected readonly invoices = signal<InvoiceRecord[]>([]);
  protected readonly invoiceSearch = signal('');
  protected readonly selectedInvoice = signal<InvoiceRecord | null>(null);
  protected readonly template = signal<EmailTemplateRecord | null>(null);
  protected readonly settings = signal<TenantSettingsRecord | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly savingLine = signal(false);
  protected readonly savingPayment = signal(false);
  protected readonly savingStatus = signal(false);
  protected readonly downloading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly showSend = signal(false);
  protected readonly showPayment = signal(false);
  protected readonly showStatement = signal(false);
  protected readonly showBatchInvoice = signal(false);
  protected readonly showBulkInvoice = signal(false);
  protected readonly savingBatch = signal(false);
  protected readonly loadingBulkPreview = signal(false);
  protected readonly savingBulkInvoices = signal(false);
  protected readonly bulkPreview = signal<BulkInvoicePreviewRecord | null>(null);
  protected readonly expandedBulkOwnerIds = signal<string[]>([]);
  protected readonly hiddenBulkWorkOrderIds = signal<string[]>([]);
  protected readonly sendTarget = signal<InvoiceRecord | null>(null);
  protected readonly paymentTarget = signal<InvoiceRecord | null>(null);
  protected readonly statement = signal<OwnerStatementRecord | null>(null);
  protected readonly owners = signal<PropertyOwner[]>([]);
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly workOrders = signal<WorkOrderRecord[]>([]);
  protected readonly inventoryItems = signal<InventoryItem[]>([]);
  protected readonly batchForm: {
    ownerId: string;
    propertyId: string;
    workOrderIds: string[];
    issuedOn: string;
    dueOn: string;
    additionalLines: BatchLineDraft[];
  } = {
    ownerId: '',
    propertyId: '',
    workOrderIds: [],
    issuedOn: todayInput(),
    dueOn: addDaysInput(30),
    additionalLines: []
  };
  protected readonly bulkForm: {
    fromDate: string;
    toDate: string;
    issuedOn: string;
    dueOn: string;
    workOrderIds: string[];
  } = {
    fromDate: monthStartInput(),
    toDate: todayInput(),
    issuedOn: todayInput(),
    dueOn: addDaysInput(30),
    workOrderIds: []
  };
  protected bulkSearch = '';
  protected readonly sendForm = { recipientEmail: '', ccEmails: '', bccEmails: '', subject: '', body: '' };
  protected readonly lineForm: { lineType: InvoiceLineType; inventoryItemId: string; description: string; quantity: number; unitPrice: number; taxable: boolean; taxRatePercent: number } = {
    lineType: 'CUSTOM',
    inventoryItemId: '',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxable: false,
    taxRatePercent: 0
  };
  protected readonly editingLineId = signal<string | null>(null);
  protected readonly lineEditForm: { lineType: InvoiceLineType; description: string; quantity: number; unitPrice: number; taxable: boolean; taxRatePercent: number } = {
    lineType: 'CUSTOM',
    description: '',
    quantity: 1,
    unitPrice: 0,
    taxable: false,
    taxRatePercent: 0
  };
  protected readonly paymentForm: { amount: number; paymentMethod: PaymentMethod; reference: string; note: string } = {
    amount: 0,
    paymentMethod: 'E_TRANSFER',
    reference: '',
    note: ''
  };
  protected readonly receivables = computed(() => this.invoices().filter((invoice) => !['PAID', 'VOID'].includes(invoice.status)).reduce((total, invoice) => total + Number(invoice.balanceDue || 0), 0));
  protected readonly paidTotal = computed(() => this.invoices().reduce((total, invoice) => total + Number(invoice.paidTotal || 0), 0));

  protected filteredInvoices(): InvoiceRecord[] {
    const query = this.invoiceSearch().trim().toLowerCase();
    if (!query) {
      return this.invoices();
    }
    return this.invoices().filter((invoice) => [
      invoice.invoiceNumber,
      invoice.ownerName,
      invoice.ownerCode,
      invoice.ownerEmail,
      invoice.ownerBillingEmail,
      invoice.propertyName,
      invoice.propertyCode,
      invoice.status,
      invoice.issuedOn,
      invoice.dueOn,
      ...(invoice.workOrders || []).flatMap((workOrder) => [workOrder.workOrderNumber, workOrder.title, workOrder.serviceName, workOrder.propertyName, workOrder.propertyCode])
    ].some((value) => String(value || '').toLowerCase().includes(query)));
  }

  protected filteredProperties(): PropertyRecord[] {
    const ownerId = this.batchForm.ownerId;
    return this.properties()
      .filter((property) => !ownerId || property.ownerId === ownerId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  protected batchCandidates(): WorkOrderRecord[] {
    const ownerId = this.batchForm.ownerId;
    const propertyId = this.batchForm.propertyId;
    const alreadyInvoiced = new Set(this.invoices().filter((invoice) => invoice.status !== 'VOID').flatMap((invoice) => [
      invoice.workOrderId,
      ...(invoice.workOrders || []).map((workOrder) => workOrder.workOrderId)
    ]).filter(Boolean) as string[]);
    return this.workOrders()
      .filter((workOrder) => ownerId && workOrder.ownerId === ownerId)
      .filter((workOrder) => !propertyId || workOrder.propertyId === propertyId)
      .filter((workOrder) => ['APPROVED', 'CUSTOMER_NOTIFIED'].includes(workOrder.status))
      .filter((workOrder) => !alreadyInvoiced.has(workOrder.id) || this.batchForm.workOrderIds.includes(workOrder.id))
      .sort((left, right) => String(left.scheduledStart || '').localeCompare(String(right.scheduledStart || '')) || left.workOrderNumber.localeCompare(right.workOrderNumber));
  }

  protected invoiceWorkSummary(invoice: InvoiceRecord): string {
    return invoiceWorkSummaryText(invoice);
  }

  protected invoicePropertySummary(invoice: InvoiceRecord): string {
    return invoicePropertySummaryText(invoice);
  }

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [invoices, template, settings, analytics] = await Promise.all([
        firstValueFrom(this.invoiceService.list()),
        firstValueFrom(this.emailTemplateService.invoiceOwner()),
        firstValueFrom(this.tenantSettingsService.get()),
        firstValueFrom(this.analyticsService.overview())
      ]);
      this.invoices.set(invoices);
      this.template.set(template);
      this.settings.set(settings);
      this.owners.set(analytics.owners);
      this.properties.set(analytics.properties);
      this.workOrders.set(analytics.workOrders);
      this.inventoryItems.set(analytics.inventoryItems);
      this.selectedInvoice.set(invoices[0] ?? null);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load invoices.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected select(invoice: InvoiceRecord): void {
    this.cancelEditLine();
    this.selectedInvoice.set(invoice);
  }

  protected openBatchInvoice(): void {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    this.batchForm.ownerId = '';
    this.batchForm.propertyId = '';
    this.batchForm.workOrderIds = [];
    this.batchForm.issuedOn = todayInput();
    this.batchForm.dueOn = addDaysInput(30);
    this.batchForm.additionalLines = [];
    this.showBatchInvoice.set(true);
  }

  protected toggleBatchWorkOrder(workOrderId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    this.batchForm.workOrderIds = checked
      ? Array.from(new Set([...this.batchForm.workOrderIds, workOrderId]))
      : this.batchForm.workOrderIds.filter((id) => id !== workOrderId);
  }

  protected selectAllBatchCandidates(): void {
    this.batchForm.workOrderIds = this.batchCandidates().map((workOrder) => workOrder.id);
  }

  protected addBatchLine(): void {
    this.batchForm.additionalLines = [
      ...this.batchForm.additionalLines,
      {
        id: crypto.randomUUID(),
        lineType: 'CUSTOM',
        description: '',
        quantity: 1,
        unitPrice: 0,
        taxable: false,
        taxRatePercent: 0
      }
    ];
  }

  protected activeInventoryItems(): InventoryItem[] {
    return this.inventoryItems().filter((item) => item.active);
  }

  protected applyInventoryToLineForm(): void {
    const item = this.inventoryItems().find((candidate) => candidate.id === this.lineForm.inventoryItemId);
    if (!item) {
      return;
    }
    this.lineForm.description = item.name;
    this.lineForm.unitPrice = Number(item.billingCost ?? 0);
  }

  protected applyInventoryToBatchLine(line: BatchLineDraft): void {
    const item = this.inventoryItems().find((candidate) => candidate.id === line.inventoryItemId);
    if (!item) {
      return;
    }
    line.description = item.name;
    line.unitPrice = Number(item.billingCost ?? 0);
  }

  protected removeBatchLine(lineId: string): void {
    this.batchForm.additionalLines = this.batchForm.additionalLines.filter((line) => line.id !== lineId);
  }

  protected openBulkInvoice(): void {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    this.bulkForm.fromDate = monthStartInput();
    this.bulkForm.toDate = todayInput();
    this.bulkForm.issuedOn = todayInput();
    this.bulkForm.dueOn = addDaysInput(30);
    this.bulkForm.workOrderIds = [];
    this.bulkSearch = '';
    this.bulkPreview.set(null);
    this.expandedBulkOwnerIds.set([]);
    this.hiddenBulkWorkOrderIds.set([]);
    this.showBulkInvoice.set(true);
    void this.previewBulkInvoices();
  }

  protected async previewBulkInvoices(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (!this.bulkForm.fromDate || !this.bulkForm.toDate) {
      this.error.set('From and to dates are required.');
      return;
    }
    this.loadingBulkPreview.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const preview = await firstValueFrom(this.invoiceService.previewBulk({
        fromDate: this.bulkForm.fromDate,
        toDate: this.bulkForm.toDate
      }));
      const eligibleIds = new Set(preview.owners.flatMap((owner) => owner.workOrders.map((workOrder) => workOrder.workOrderId)));
      this.bulkForm.workOrderIds = this.bulkForm.workOrderIds.filter((id) => eligibleIds.has(id));
      this.expandedBulkOwnerIds.set(preview.owners.length <= 5 ? preview.owners.map((owner) => owner.ownerId) : []);
      this.hiddenBulkWorkOrderIds.set([]);
      this.bulkPreview.set(preview);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to preview bulk invoices.'));
    } finally {
      this.loadingBulkPreview.set(false);
    }
  }

  protected filteredBulkOwners(): BulkInvoiceOwnerGroupRecord[] {
    const preview = this.bulkPreview();
    if (!preview) {
      return [];
    }
    const search = this.bulkSearch.trim().toLowerCase();
    const hidden = new Set(this.hiddenBulkWorkOrderIds());
    return preview.owners
      .map((owner) => ({
        ...owner,
        workOrders: owner.workOrders
          .filter((workOrder) => !hidden.has(workOrder.workOrderId))
          .filter((workOrder) => !search || bulkWorkOrderMatches(owner, workOrder, search))
      }))
      .map((owner) => ({
        ...owner,
        workOrderCount: owner.workOrders.length,
        estimatedSubtotal: owner.workOrders.reduce((total, workOrder) => total + Number(workOrder.estimatedSubtotal || 0), 0)
      }))
      .filter((owner) => owner.workOrders.length > 0);
  }

  protected bulkOwnerSelected(owner: BulkInvoiceOwnerGroupRecord): boolean {
    return owner.workOrders.length > 0 && owner.workOrders.every((workOrder) => this.bulkForm.workOrderIds.includes(workOrder.workOrderId));
  }

  protected bulkOwnerSelectedCount(owner: BulkInvoiceOwnerGroupRecord): number {
    return owner.workOrders.filter((workOrder) => this.bulkForm.workOrderIds.includes(workOrder.workOrderId)).length;
  }

  protected bulkOwnerExpanded(owner: BulkInvoiceOwnerGroupRecord): boolean {
    return this.expandedBulkOwnerIds().includes(owner.ownerId);
  }

  protected toggleBulkOwnerExpanded(ownerId: string): void {
    this.expandedBulkOwnerIds.update((ownerIds) => ownerIds.includes(ownerId)
      ? ownerIds.filter((id) => id !== ownerId)
      : [...ownerIds, ownerId]
    );
  }

  protected toggleBulkOwner(owner: BulkInvoiceOwnerGroupRecord, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    const ownerWorkOrderIds = owner.workOrders.map((workOrder) => workOrder.workOrderId);
    this.bulkForm.workOrderIds = checked
      ? Array.from(new Set([...this.bulkForm.workOrderIds, ...ownerWorkOrderIds]))
      : this.bulkForm.workOrderIds.filter((id) => !ownerWorkOrderIds.includes(id));
  }

  protected toggleBulkWorkOrder(workOrderId: string, event: Event): void {
    const checked = event.target instanceof HTMLInputElement && event.target.checked;
    this.bulkForm.workOrderIds = checked
      ? Array.from(new Set([...this.bulkForm.workOrderIds, workOrderId]))
      : this.bulkForm.workOrderIds.filter((id) => id !== workOrderId);
  }

  protected selectAllBulkVisible(): void {
    this.bulkForm.workOrderIds = Array.from(new Set([
      ...this.bulkForm.workOrderIds,
      ...this.filteredBulkOwners().flatMap((owner) => owner.workOrders.map((workOrder) => workOrder.workOrderId))
    ]));
  }

  protected clearBulkSelection(): void {
    this.bulkForm.workOrderIds = [];
  }

  protected removeBulkWorkOrder(workOrderId: string): void {
    this.hiddenBulkWorkOrderIds.update((ids) => ids.includes(workOrderId) ? ids : [...ids, workOrderId]);
    this.bulkForm.workOrderIds = this.bulkForm.workOrderIds.filter((id) => id !== workOrderId);
  }

  protected bulkSelectedSubtotal(): number {
    const selected = new Set(this.bulkForm.workOrderIds);
    return (this.bulkPreview()?.owners || [])
      .flatMap((owner) => owner.workOrders)
      .filter((workOrder) => selected.has(workOrder.workOrderId))
      .reduce((total, workOrder) => total + Number(workOrder.estimatedSubtotal || 0), 0);
  }

  protected serviceWindowText(workOrder: BulkInvoiceWorkOrderRecord): string {
    if (!workOrder.scheduledStart) {
      return 'No service date';
    }
    if (!workOrder.scheduledEnd) {
      return this.dateTime(workOrder.scheduledStart);
    }
    return `${this.dateTime(workOrder.scheduledStart)} - ${this.dateTime(workOrder.scheduledEnd)}`;
  }

  protected async createBulkInvoices(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.bulkForm.workOrderIds.length === 0) {
      this.error.set('Select at least one work order.');
      return;
    }
    this.savingBulkInvoices.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await firstValueFrom(this.invoiceService.createBulk({
        fromDate: this.bulkForm.fromDate || undefined,
        toDate: this.bulkForm.toDate || undefined,
        workOrderIds: this.bulkForm.workOrderIds,
        issuedOn: this.bulkForm.issuedOn || undefined,
        dueOn: this.bulkForm.dueOn || undefined
      }));
      this.showBulkInvoice.set(false);
      await this.load();
      const firstCreated = result.invoices[0];
      if (firstCreated) {
        this.selectedInvoice.set(this.invoices().find((invoice) => invoice.id === firstCreated.id) || firstCreated);
      }
      const skipped = result.skippedWorkOrderCount > 0 ? ` ${result.skippedWorkOrderCount} work orders were skipped because they were no longer eligible.` : '';
      this.message.set(`${result.invoices.length} draft invoice${result.invoices.length === 1 ? '' : 's'} created from ${this.bulkForm.fromDate} to ${this.bulkForm.toDate}.${skipped}`);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to create bulk invoices.'));
    } finally {
      this.savingBulkInvoices.set(false);
    }
  }

  protected async createBatchInvoice(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (!this.batchForm.ownerId) {
      this.error.set('Owner is required.');
      return;
    }
    if (this.batchForm.workOrderIds.length === 0) {
      this.error.set('Select at least one work order.');
      return;
    }
    this.savingBatch.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const created = await firstValueFrom(this.invoiceService.createBatch({
        ownerId: this.batchForm.ownerId,
        propertyId: this.batchForm.propertyId || undefined,
        workOrderIds: this.batchForm.workOrderIds,
        issuedOn: this.batchForm.issuedOn || undefined,
        dueOn: this.batchForm.dueOn || undefined,
        additionalLines: this.batchForm.additionalLines
          .filter((line) => (line.description || '').trim())
          .map((line) => ({
            lineType: line.lineType,
            description: line.description.trim(),
            quantity: Number(line.quantity || 0),
            unitPrice: Number(line.unitPrice || 0),
            taxable: !!line.taxable,
            taxRate: Number(line.taxRatePercent || 0) / 100
          }))
      }));
      this.showBatchInvoice.set(false);
      await this.load();
      this.selectedInvoice.set(this.invoices().find((invoice) => invoice.id === created.id) || created);
      this.message.set(`Draft invoice ${created.invoiceNumber} created.`);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to create invoice.'));
    } finally {
      this.savingBatch.set(false);
    }
  }

  protected async addLine(invoice: InvoiceRecord): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.savingLine()) {
      return;
    }
    const description = this.lineForm.description.trim();
    if (!description) {
      this.error.set('Line description is required.');
      return;
    }
    this.savingLine.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.addLine(invoice.id, {
        lineType: this.lineForm.lineType,
        description,
        quantity: Number(this.lineForm.quantity || 0),
        unitPrice: Number(this.lineForm.unitPrice || 0),
        taxable: this.lineForm.taxable,
        taxRate: Number(this.lineForm.taxRatePercent || 0) / 100
      }));
      this.replaceInvoice(updated);
      this.resetLineForm();
      this.message.set('Draft invoice line added.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to add invoice line.'));
    } finally {
      this.savingLine.set(false);
    }
  }

  protected async deleteLine(invoice: InvoiceRecord, lineId: string): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.savingLine()) {
      return;
    }
    if (!window.confirm('Delete this invoice line?')) {
      return;
    }
    this.savingLine.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.deleteLine(invoice.id, lineId));
      this.replaceInvoice(updated);
      if (this.editingLineId() === lineId) {
        this.cancelEditLine();
      }
      this.message.set('Draft invoice line deleted.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to delete invoice line.'));
    } finally {
      this.savingLine.set(false);
    }
  }

  protected startEditLine(line: InvoiceLineRecord): void {
    this.editingLineId.set(line.id);
    this.lineEditForm.lineType = line.lineType;
    this.lineEditForm.description = line.description;
    this.lineEditForm.quantity = Number(line.quantity || 0);
    this.lineEditForm.unitPrice = Number(line.unitPrice || 0);
    this.lineEditForm.taxable = Boolean(line.taxable);
    this.lineEditForm.taxRatePercent = Number(line.taxRate || 0) * 100;
    this.error.set('');
    this.message.set('');
  }

  protected cancelEditLine(): void {
    this.editingLineId.set(null);
  }

  protected async updateLine(invoice: InvoiceRecord, line: InvoiceLineRecord): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.savingLine()) {
      return;
    }
    const description = this.lineEditForm.description.trim();
    if (!description) {
      this.error.set('Line description is required.');
      return;
    }
    this.savingLine.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.updateLine(invoice.id, line.id, {
        lineType: this.lineEditForm.lineType,
        description,
        quantity: Number(this.lineEditForm.quantity || 0),
        unitPrice: Number(this.lineEditForm.unitPrice || 0),
        taxable: this.lineEditForm.taxable,
        taxRate: Number(this.lineEditForm.taxRatePercent || 0) / 100
      }));
      this.replaceInvoice(updated);
      this.cancelEditLine();
      this.message.set('Draft invoice line updated.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to update invoice line.'));
    } finally {
      this.savingLine.set(false);
    }
  }

  private replaceInvoice(invoice: InvoiceRecord): void {
    this.invoices.update((invoices) => invoices.map((candidate) => candidate.id === invoice.id ? invoice : candidate));
    this.selectedInvoice.set(invoice);
  }

  private resetLineForm(): void {
    this.lineForm.lineType = 'CUSTOM';
    this.lineForm.inventoryItemId = '';
    this.lineForm.description = '';
    this.lineForm.quantity = 1;
    this.lineForm.unitPrice = 0;
    this.lineForm.taxable = false;
    this.lineForm.taxRatePercent = 0;
  }

  protected openPayment(invoice: InvoiceRecord): void {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    this.paymentTarget.set(invoice);
    this.paymentForm.amount = Number(invoice.balanceDue || 0);
    this.paymentForm.paymentMethod = 'E_TRANSFER';
    this.paymentForm.reference = '';
    this.paymentForm.note = '';
    this.showPayment.set(true);
  }

  protected async recordPayment(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const invoice = this.paymentTarget();
    if (!invoice || this.savingPayment()) {
      return;
    }
    this.savingPayment.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.recordPayment(invoice.id, {
        amount: Number(this.paymentForm.amount || 0),
        paymentMethod: this.paymentForm.paymentMethod,
        reference: this.paymentForm.reference || undefined,
        note: this.paymentForm.note || undefined
      }));
      this.replaceInvoice(updated);
      this.showPayment.set(false);
      this.message.set('Payment recorded.');
      await this.load();
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to record payment.'));
    } finally {
      this.savingPayment.set(false);
    }
  }

  protected async updateStatus(invoice: InvoiceRecord, status: InvoiceStatus, reason = ''): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    if (this.savingStatus()) {
      return;
    }
    this.savingStatus.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.updateStatus(invoice.id, { status, reason }));
      this.replaceInvoice(updated);
      this.message.set(`Invoice marked ${this.statusText(updated.status)}.`);
      await this.load();
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to update invoice status.'));
    } finally {
      this.savingStatus.set(false);
    }
  }

  protected voidInvoice(invoice: InvoiceRecord): void {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const reason = window.prompt('Reason for voiding this invoice?')?.trim();
    if (!reason) {
      return;
    }
    void this.updateStatus(invoice, 'VOID', reason);
  }

  protected async openStatement(invoice: InvoiceRecord): Promise<void> {
    this.error.set('');
    try {
      this.statement.set(await firstValueFrom(this.invoiceService.ownerStatement(invoice.customerId)));
      this.showStatement.set(true);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load owner statement.'));
    }
  }

  protected ownerEmail(invoice: InvoiceRecord): string {
    return invoice.ownerBillingEmail || invoice.ownerEmail || '';
  }

  protected openSend(invoice: InvoiceRecord): void {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const template = this.template();
    this.sendTarget.set(invoice);
    this.sendForm.recipientEmail = this.ownerEmail(invoice);
    this.sendForm.ccEmails = '';
    this.sendForm.bccEmails = '';
    this.sendForm.subject = render(template?.subject || 'Invoice {{invoiceNumber}}', invoice, this.settings());
    this.sendForm.body = render(template?.body || '', invoice, this.settings());
    this.showSend.set(true);
  }

  protected updateSendBody(event: Event): void {
    if (event.target instanceof HTMLElement) {
      this.sendForm.body = event.target.innerHTML;
    }
  }

  protected async sendInvoiceEmail(): Promise<void> {
    if (!this.ensureCanManageBilling()) {
      return;
    }
    const invoice = this.sendTarget();
    if (!invoice || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await firstValueFrom(this.invoiceService.sendEmail(invoice.id, {
        templateId: this.template()?.id,
        recipientEmail: this.sendForm.recipientEmail,
        ccEmails: this.sendForm.ccEmails,
        bccEmails: this.sendForm.bccEmails,
        subject: this.sendForm.subject,
        body: this.sendForm.body
      }));
      this.message.set(result.status === 'SENT' ? `Invoice sent to ${result.recipientEmail}.` : `Invoice email recorded for ${result.recipientEmail}.`);
      this.showSend.set(false);
      await this.load();
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to email invoice.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected printInvoice(invoice: InvoiceRecord): void {
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      return;
    }
    printWindow.document.open();
    printWindow.document.write(invoicePrintHtml(invoice, this.settings()));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  protected async downloadPdf(invoice: InvoiceRecord): Promise<void> {
    if (this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.error.set('');
    try {
      const blob = await firstValueFrom(this.invoiceService.downloadPdf(invoice.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFilename(invoice.invoiceNumber)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to download invoice PDF.'));
    } finally {
      this.downloading.set(false);
    }
  }

  protected statusText(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'PAID') {
      return 'success';
    }
    if (status === 'DRAFT') {
      return 'warn';
    }
    if (status === 'VOID' || status === 'OVERDUE') {
      return 'danger';
    }
    if (status === 'PARTIALLY_PAID') {
      return 'info';
    }
    return 'info';
  }

  protected currency(value: string | number): string {
    return currencyText(value);
  }

  protected percent(value: string | number): string {
    const amount = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(amount) ? `${Math.round(amount * 10000) / 100}%` : '0%';
  }

  protected dateTime(value: string): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  }

  protected printStatement(statement: OwnerStatementRecord): void {
    const printWindow = window.open('', '_blank', 'width=900,height=1100');
    if (!printWindow) {
      return;
    }
    printWindow.document.open();
    printWindow.document.write(statementPrintHtml(statement));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 250);
  }

  private ensureCanManageBilling(): boolean {
    if (this.canManageBilling()) {
      return true;
    }
    this.error.set(this.billingDeniedMessage);
    this.message.set('');
    return false;
  }
}

function render(template: string, invoice: InvoiceRecord, settings?: TenantSettingsRecord | null): string {
  const brand = invoiceBrand(settings);
  const values: Record<string, string> = {
    invoiceNumber: invoice.invoiceNumber,
    ownerCode: invoice.ownerCode || '',
    ownerName: invoice.ownerName,
    propertyCode: invoice.propertyCode || '',
    propertyName: invoicePropertySummaryText(invoice),
    propertyAddress: '',
    workOrderNumber: invoiceWorkSummaryText(invoice),
    workOrderTitle: invoice.workOrderTitle || '',
    invoiceSubtotal: currencyText(invoice.subtotal),
    invoiceTax: currencyText(invoice.taxTotal),
    invoiceTotal: currencyText(invoice.total),
    issuedOn: invoice.issuedOn || '',
    dueOn: invoice.dueOn || '',
    tenantName: brand.name
  };
  return Object.entries(values).reduce((body, [key, value]) => body.replaceAll(`{{${key}}}`, value), template);
}

function invoicePrintHtml(invoice: InvoiceRecord, settings?: TenantSettingsRecord | null): string {
  const brand = invoiceBrand(settings);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #020617; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.25; }
    .page { min-height: 11in; padding: 0.38in 0.52in 0.44in; position: relative; }
    .brand-bar { position: absolute; left: 0; right: 0; height: 22pt; background: ${escapeHtml(brand.primary)}; }
    .brand-bar.top { top: 0; }
    .brand-bar.bottom { bottom: 0; height: 14pt; }
    .invoice-title { margin: 42pt 0 26pt; text-align: right; font-size: 24pt; font-weight: 800; letter-spacing: 0.01em; }
    .brand-name { position: absolute; top: 68pt; left: 124pt; max-width: 250pt; margin: 0; color: ${escapeHtml(brand.primary)}; font-size: 15pt; font-weight: 800; }
    .logo { position: absolute; top: 45pt; left: 54pt; display: grid; width: 58pt; height: 58pt; place-items: center; background: #fff; border: 1px solid #cbd5e1; color: ${escapeHtml(brand.primary)}; font-size: 8pt; font-weight: 800; padding: 4pt; }
    .logo img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
    .columns { display: grid; grid-template-columns: 1fr 1.15fr 0.88fr; gap: 24pt; min-height: 88pt; }
    .label { margin: 0 0 4pt; color: ${escapeHtml(brand.primary)}; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; }
    .meta { text-align: right; }
    .meta-block { margin-bottom: 4pt; line-height: 1; }
    .meta-block:last-child { margin-bottom: 0; }
    .meta-block p { margin: 0; }
    p { margin: 1.5pt 0; }
    .rule { border-top: 1px solid #cbd5e1; margin: 10pt 0 14pt; }
    .work-summary { display: grid; grid-template-columns: 1fr auto; gap: 14pt; align-items: start; margin-bottom: 18pt; border: 1px solid #d8e0ea; border-left: 4pt solid ${escapeHtml(brand.primary)}; background: #f7fbfa; padding: 11pt 12pt; }
    .work-summary .label { margin-bottom: 6pt; }
    .work-title { display: block; color: #020617; font-size: 11pt; font-weight: 800; }
    .work-numbers { margin-top: 4pt; color: #334155; font-size: 8.5pt; font-weight: 700; }
    .work-property { margin-top: 3pt; color: #64748b; font-size: 8.3pt; }
    .work-chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6pt; max-width: 310pt; }
    .code-chip { min-width: 92pt; border: 1px solid #d8e0ea; background: #fff; padding: 5pt 7pt; }
    .property-code-chip { max-width: 310pt; min-width: 190pt; }
    .code-chip span { display: block; color: #64748b; font-size: 6.5pt; font-weight: 800; text-transform: uppercase; }
    .code-chip strong { display: block; margin-top: 2pt; color: ${escapeHtml(brand.primary)}; font-size: 7.8pt; overflow-wrap: anywhere; }
    .invoice-lines { width: 100%; border: 1px solid #cbd5e1; border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 8.5pt; }
    .invoice-lines th, .invoice-lines td { border: 0; border-right: 1px solid #d8e0ea; border-bottom: 1px solid #d8e0ea; padding: 7pt 8pt; text-align: left; vertical-align: top; }
    .invoice-lines th:last-child, .invoice-lines td:last-child { border-right: 0; }
    .invoice-lines tbody tr:last-child td { border-bottom: 0; }
    .invoice-lines th { background: ${escapeHtml(brand.primary)}; color: white; font-size: 7.5pt; font-weight: 800; text-transform: uppercase; }
    .group td { background: #eef7f5; border-top: 2pt solid ${escapeHtml(brand.primary)}; padding: 8pt 10pt; }
    .group:first-child td { border-top: 0; }
    .group-title { display: block; color: ${escapeHtml(brand.primary)}; font-weight: 800; }
    .group-subtitle { display: block; margin-top: 2pt; color: #475569; font-size: 7.5pt; }
    .invoice-line td { background: #fff; }
    .invoice-line.material td { background: #fbfdff; }
    .invoice-line td.desc { border-left: 4pt solid ${escapeHtml(brand.primary)}; padding-left: 7pt; }
    .invoice-line.material td.desc { border-left-color: ${escapeHtml(brand.accent)}; }
    .line-detail { display: block; margin-top: 2pt; }
    .desc { width: 61%; }
    .qty { width: 10%; text-align: center; }
    .unit { width: 15%; text-align: right; }
    .amount { width: 14%; text-align: right; }
    .line-type { display: block; color: #475569; font-size: 7.5pt; font-weight: 700; }
    .closing { display: grid; grid-template-columns: 1fr 210pt; gap: 22pt; margin-top: 16pt; align-items: stretch; }
    .notes { min-height: 118pt; height: 100%; border: 1px solid #d8e0ea; padding: 12pt; }
    .terms { margin-top: 24pt; }
    .totals { height: 100%; border: 1px solid #d8e0ea; background: #f8fafc; padding: 12pt 12pt 10pt; }
    .total-row { display: flex; justify-content: space-between; gap: 14pt; margin-bottom: 8pt; }
    .total-row.total { border-top: 1px solid #cbd5e1; margin-top: 4pt; padding-top: 10pt; font-size: 11pt; font-weight: 800; }
    .balance { display: flex; justify-content: space-between; margin: 10pt -2pt 0; padding: 8pt 10pt; background: #e7f8ef; font-weight: 800; }
    footer { display: flex; justify-content: space-between; margin-top: 18pt; border-top: 1px solid #d8e0ea; padding: 8pt 0 18pt; color: #64748b; font-size: 7.5pt; }
    .right { text-align: right; }
  </style></head><body>
    <div class="page">
      <div class="brand-bar top"></div>
      <div class="brand-bar bottom"></div>
      <div class="logo">${brand.logoUrl ? `<img src="${escapeAttribute(brand.logoUrl)}" alt="${escapeAttribute(brand.name)} logo">` : escapeHtml(initials(brand.name))}</div>
      <h1 class="invoice-title">INVOICE</h1>
      <p class="brand-name">${escapeHtml(brand.name)}</p>
      <div class="columns">
        <section>
          <p class="label">Bill from</p>
          ${brand.legalName ? `<p>${escapeHtml(brand.legalName)}</p>` : ''}
          ${brand.address ? `<p>${escapeHtml(brand.address)}</p>` : '<p>Tenant address not configured</p>'}
          ${brand.contact ? `<p>${escapeHtml(brand.contact)}</p>` : ''}
        </section>
        <section>
          <p class="label">Invoice to</p>
          <p>${escapeHtml(invoice.ownerName)}</p>
          <p>${escapeHtml(invoice.ownerBillingEmail || invoice.ownerEmail || '')}</p>
          ${invoice.ownerAddress ? `<p>${escapeHtml(invoice.ownerAddress)}</p>` : ''}
          ${invoice.workOrders.length > 1 ? `<p>${escapeHtml(invoicePropertySummaryText(invoice))}</p>` : ''}
        </section>
        <section class="meta">
          <div class="meta-block"><p class="label">Invoice number</p><p><strong>${escapeHtml(invoice.invoiceNumber)}</strong></p></div>
          <div class="meta-block"><p class="label">Date of invoice</p><p><strong>${escapeHtml(invoice.issuedOn || '-')}</strong></p></div>
          <div class="meta-block"><p class="label">Due date</p><p><strong>${escapeHtml(invoice.dueOn || '-')}</strong></p></div>
          ${brand.taxRegistrationNumber ? `<div class="meta-block"><p class="label">GST/HST number</p><p><strong>${escapeHtml(brand.taxRegistrationNumber)}</strong></p></div>` : ''}
        </section>
      </div>
      <div class="rule"></div>
      <section class="work-summary">
        <div>
          <p class="label">Property and work order</p>
          <strong class="work-title">${escapeHtml(invoiceWorkSummaryTitle(invoice))}</strong>
          <p class="work-numbers">${escapeHtml(invoiceWorkNumbersText(invoice))}</p>
          <p class="work-property">${escapeHtml(invoicePropertySummaryText(invoice))}</p>
        </div>
        <div class="work-chips">
          ${invoice.ownerCode ? `<p class="code-chip"><span>Owner ID</span><strong>${escapeHtml(invoice.ownerCode)}</strong></p>` : ''}
          ${invoicePropertyCodeSummary(invoice) ? `<p class="code-chip property-code-chip"><span>${escapeHtml(invoicePropertyCodeLabel(invoice))}</span><strong>${escapeHtml(invoicePropertyCodeSummary(invoice))}</strong></p>` : ''}
        </div>
      </section>
      ${invoiceTable(invoice)}
      <div class="closing">
        <section class="notes">
          <p class="label">Notes</p>
          <p>${escapeHtml(brand.footer)}</p>
          <div class="terms">
            <p class="label">Terms and conditions</p>
            <p>${escapeHtml(brand.paymentTerms)}</p>
          </div>
        </section>
        <section class="totals">
          <p class="total-row"><span>Subtotal</span><strong>${escapeHtml(currencyText(invoice.subtotal))}</strong></p>
          <p class="total-row"><span>${escapeHtml(invoiceTaxLabel(brand))}</span><strong>${escapeHtml(currencyText(invoice.taxTotal))}</strong></p>
          <p class="total-row total"><span>Total</span><strong>${escapeHtml(currencyText(invoice.total))}</strong></p>
          <p class="total-row"><span>Paid</span><strong>${escapeHtml(currencyText(invoice.paidTotal))}</strong></p>
          <p class="balance"><span>Balance due</span><span>${escapeHtml(currencyText(invoice.balanceDue))}</span></p>
        </section>
      </div>
      <footer><span>${escapeHtml(joinText(' · ', brand.name, brand.contact, brand.website))}</span><span>Page 1</span></footer>
    </div>
  </body></html>`;
}

function invoiceBrand(settings?: TenantSettingsRecord | null): {
  name: string;
  legalName: string;
  address: string;
  contact: string;
  website: string;
  taxRegistrationNumber: string;
  invoiceTaxRate: number;
  provinceCode: string;
  footer: string;
  paymentTerms: string;
  primary: string;
  accent: string;
  logoUrl: string;
} {
  const name = firstNonBlank(settings?.organizationName, settings?.tenantName, settings?.legalName, 'Property Services');
  const legalName = firstNonBlank(settings?.legalName);
  return {
    name,
    legalName: legalName && !sameText(name, legalName) ? legalName : '',
    address: joinText(', ', settings?.addressLine1 || '', settings?.city || '', settings?.provinceCode || '', settings?.postalCode || '', settings?.countryCode || ''),
    contact: firstNonBlank(settings?.billingEmail, settings?.supportEmail, settings?.phone),
    website: firstNonBlank(settings?.websiteUrl),
    taxRegistrationNumber: firstNonBlank(settings?.taxRegistrationNumber),
    invoiceTaxRate: Number(settings?.invoiceTaxRate || 0),
    provinceCode: firstNonBlank(settings?.provinceCode),
    footer: firstNonBlank(settings?.invoiceFooter, 'Thank you for your business.'),
    paymentTerms: firstNonBlank(settings?.paymentTerms, 'Payment due by the invoice due date.'),
    primary: /^#[0-9A-Fa-f]{6}$/.test(settings?.themePrimaryColor || '') ? settings?.themePrimaryColor || '#0f766e' : '#0f766e',
    accent: /^#[0-9A-Fa-f]{6}$/.test(settings?.themeAccentColor || '') ? settings?.themeAccentColor || '#2563eb' : '#2563eb',
    logoUrl: absoluteAssetUrl(settings?.logoUrl || '')
  };
}

function invoiceTaxLabel(brand: ReturnType<typeof invoiceBrand>): string {
  if (brand.invoiceTaxRate <= 0) {
    return 'Tax';
  }
  const region = brand.provinceCode ? ` (${brand.provinceCode})` : '';
  return `HST${region} on sales ${(brand.invoiceTaxRate * 100).toFixed(2)}%`;
}

function invoiceWorkSummaryText(invoice: InvoiceRecord): string {
  return joinText(' · ', invoiceWorkSummaryTitle(invoice), invoiceWorkNumbersText(invoice)) || 'Single work order';
}

function invoiceWorkSummaryTitle(invoice: InvoiceRecord): string {
  const workOrders = invoice.workOrders || [];
  if (workOrders.length <= 1) {
    return invoice.workOrderTitle || 'Single work order';
  }
  return `${workOrders.length} work orders included`;
}

function invoiceWorkNumbersText(invoice: InvoiceRecord): string {
  const workOrders = invoice.workOrders || [];
  if (workOrders.length <= 1) {
    return invoice.workOrderNumber || '';
  }
  const numbers = workOrders
    .map((workOrder) => workOrder.workOrderNumber)
    .filter((value) => value?.trim())
    .slice(0, 3);
  const suffix = workOrders.length > 3 ? ` +${workOrders.length - 3} more` : '';
  return numbers.length ? `${numbers.join(', ')}${suffix}` : '';
}

function invoicePropertySummaryText(invoice: InvoiceRecord): string {
  const workOrders = invoice.workOrders || [];
  if (workOrders.length <= 1) {
    return invoice.propertyCode ? `Property ID: ${invoice.propertyCode}` : invoice.propertyName || 'No property';
  }
  const propertyNames = Array.from(new Set(workOrders.map((workOrder) => workOrder.propertyName || '').filter(Boolean)));
  if (propertyNames.length === 1) {
    return propertyNames[0];
  }
  return `${propertyNames.length || workOrders.length} properties included`;
}

function invoiceCodeSummaryText(invoice: InvoiceRecord): string {
  const ownerCode = invoice.ownerCode ? `Owner ID: ${invoice.ownerCode}` : '';
  const propertyCode = invoicePropertyCodeSummary(invoice) ? `${invoicePropertyCodeLabel(invoice)}: ${invoicePropertyCodeSummary(invoice)}` : '';
  return joinText(' · ', ownerCode, propertyCode);
}

function invoicePropertyCodeLabel(invoice: InvoiceRecord): string {
  return invoicePropertyCodes(invoice).length > 1 ? 'Property IDs' : 'Property ID';
}

function invoicePropertyCodeSummary(invoice: InvoiceRecord): string {
  const codes = invoicePropertyCodes(invoice);
  if (codes.length === 0) {
    return invoice.propertyCode || '';
  }
  return codes.join(', ');
}

function invoicePropertyCodes(invoice: InvoiceRecord): string[] {
  const codes = Array.from(new Set((invoice.workOrders || []).map((workOrder) => workOrder.propertyCode || '').filter(Boolean)));
  if (codes.length === 0 && invoice.propertyCode) {
    return [invoice.propertyCode];
  }
  return codes;
}

function invoiceTable(invoice: InvoiceRecord): string {
  const groupedRows = invoiceLineGroups(invoice)
    .map((group) => `<tr class="group"><td colspan="4"><span class="group-title">${escapeHtml(group.title)}</span><span class="group-subtitle">${escapeHtml(group.subtitle)}</span></td></tr>${group.lines.map((line) => invoiceLineRow(line, group.serviceName)).join('')}`)
    .join('');
  const rows = invoice.lines.length === 0
    ? '<tr><td colspan="4">No line items have been added.</td></tr>'
    : groupedRows;
  return `<table class="invoice-lines"><thead><tr><th class="qty">QTY</th><th class="desc">DESCRIPTION</th><th class="unit">RATE</th><th class="amount">AMOUNT</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function invoiceLineGroups(invoice: InvoiceRecord): Array<{ title: string; subtitle: string; serviceName: string; lines: InvoiceLineRecord[] }> {
  const workOrders = invoice.workOrders || [];
  const byWorkOrder = new Map(workOrders.map((workOrder) => [workOrder.workOrderId, { workOrder, lines: [] as InvoiceLineRecord[] }]));
  const additional: InvoiceLineRecord[] = [];
  for (const line of invoice.lines) {
    if (line.workOrderId && byWorkOrder.has(line.workOrderId)) {
      byWorkOrder.get(line.workOrderId)?.lines.push(line);
    } else {
      additional.push(line);
    }
  }
  const groups = Array.from(byWorkOrder.values())
    .filter((group) => group.lines.length > 0)
    .map(({ workOrder, lines }) => ({
      title: joinText(' · ', workOrder.workOrderNumber, workOrder.serviceName || workOrder.title),
      subtitle: joinText(' · ', workOrder.propertyCode ? `Property ID: ${workOrder.propertyCode}` : '', invoiceServiceWindow(workOrder)),
      serviceName: workOrder.serviceName || workOrder.title,
      lines
    }));
  if (additional.length) {
    groups.push({ title: 'Additional charges', subtitle: 'Manual invoice lines not tied to a work order.', serviceName: '', lines: additional });
  }
  return groups.length ? groups : [{ title: invoiceWorkSummaryText(invoice), subtitle: invoicePropertySummaryText(invoice), serviceName: invoice.workOrderTitle || invoice.propertyName || '', lines: invoice.lines }];
}

function invoiceLineRow(line: InvoiceLineRecord, serviceName = ''): string {
  const lineType = invoiceLineTypeLabel(line, serviceName);
  const typeClass = line.lineType?.toLowerCase() === 'material' ? 'material' : line.lineType?.toLowerCase() === 'labor' ? 'labor' : 'custom';
  return `<tr class="invoice-line ${typeClass}"><td class="qty">${escapeHtml(line.quantity)}</td><td class="desc"><span class="line-type">${escapeHtml(lineType)}</span><span class="line-detail">${escapeHtml(line.description)}</span></td><td class="unit">${escapeHtml(currencyText(line.unitPrice))}</td><td class="amount">${escapeHtml(currencyText(line.lineTotal))}</td></tr>`;
}

function invoiceLineTypeLabel(line: InvoiceLineRecord, serviceName = ''): string {
  if (line.lineType === 'LABOR' && serviceName.trim()) {
    return `Labor - ${serviceName.trim()}`;
  }
  return statusLabel(line.lineType);
}

function invoiceServiceWindow(workOrder: InvoiceWorkOrderRecord): string {
  if (!workOrder.scheduledStart) {
    return '';
  }
  const start = invoiceDateTime(workOrder.scheduledStart);
  if (!workOrder.scheduledEnd) {
    return `Service: ${start}`;
  }
  return `Service: ${start} - ${invoiceDateTime(workOrder.scheduledEnd)}`;
}

function invoiceDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function statementPrintHtml(statement: OwnerStatementRecord): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Statement - ${escapeHtml(statement.ownerName)}</title><style>
    @page { size: letter; margin: 0.45in; }
    body { color: #111827; font-family: Inter, Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
    header { display: flex; justify-content: space-between; gap: 24pt; border-bottom: 2px solid #111827; padding-bottom: 12pt; margin-bottom: 12pt; }
    h1 { margin: 0; font-size: 24pt; }
    .eyebrow { color: #0f766e; font-size: 8pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { border: 1px solid #d1d5db; padding: 6pt; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 800; }
    .right { text-align: right; }
  </style></head><body>
    <header><div><p class="eyebrow">Owner statement</p><h1>${escapeHtml(statement.ownerName)}</h1><p>${escapeHtml(statement.ownerBillingEmail || statement.ownerEmail || '')}</p></div><div class="right"><p>Invoiced: <strong>${escapeHtml(currencyText(statement.invoicedTotal))}</strong></p><p>Paid: <strong>${escapeHtml(currencyText(statement.paidTotal))}</strong></p><p>Balance: <strong>${escapeHtml(currencyText(statement.balanceDue))}</strong></p></div></header>
    <table><thead><tr><th>Invoice</th><th>Status</th><th>Due</th><th class="right">Total</th><th class="right">Balance</th></tr></thead><tbody>${statement.invoices.map((invoice) => `<tr><td>${escapeHtml(invoice.invoiceNumber)}</td><td>${escapeHtml(invoice.status)}</td><td>${escapeHtml(invoice.dueOn || '-')}</td><td class="right">${escapeHtml(currencyText(invoice.total))}</td><td class="right">${escapeHtml(currencyText(invoice.balanceDue))}</td></tr>`).join('')}</tbody></table>
  </body></html>`;
}

function currencyText(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    : '$0.00';
}

function statusLabel(value: string): string {
  return value.toLowerCase().replaceAll('_', ' ');
}

function joinText(delimiter: string, ...values: string[]): string {
  return values.filter((value) => value.trim().length > 0).join(delimiter);
}

function firstNonBlank(...values: Array<string | undefined>): string {
  return values.find((value) => value && value.trim())?.trim() || '';
}

function todayInput(): string {
  return dateInput(new Date());
}

function addDaysInput(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateInput(date);
}

function monthStartInput(): string {
  const date = new Date();
  date.setDate(1);
  return dateInput(date);
}

function dateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sameText(left: string, right: string): boolean {
  const normalizedLeft = normalizeCompanyName(left);
  const normalizedRight = normalizeCompanyName(right);
  return !!normalizedLeft && !!normalizedRight && (
    normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft)
  );
}

function normalizeCompanyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|co)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string | number | boolean): string {
  return escapeHtml(value);
}

function absoluteAssetUrl(value: string): string {
  if (!value) {
    return '';
  }
  try {
    return new URL(value, window.location.origin).toString();
  } catch {
    return value;
  }
}

function bulkWorkOrderMatches(owner: BulkInvoiceOwnerGroupRecord, workOrder: BulkInvoiceWorkOrderRecord, search: string): boolean {
  return [
    owner.ownerName,
    owner.ownerCode || '',
    owner.ownerBillingEmail || '',
    owner.ownerEmail || '',
    workOrder.workOrderNumber,
    workOrder.title,
    workOrder.propertyCode || '',
    workOrder.propertyName,
    workOrder.propertyAddress || '',
    workOrder.serviceName || ''
  ].some((value) => value.toLowerCase().includes(search));
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'LOGO';
}

function safeFilename(value: string): string {
  return value.replaceAll(/[^A-Za-z0-9._-]/g, '_');
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
