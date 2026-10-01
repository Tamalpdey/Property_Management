import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { InvoicePaymentRecord, InvoiceRecord, InvoiceStatus, RecordInvoicePaymentRequest } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InvoiceService } from './services/invoice.service';

type PaymentMethod = RecordInvoicePaymentRequest['paymentMethod'];
type PaymentQueue = 'OPEN' | 'OVERDUE' | 'PAID' | 'ALL';

interface PaymentLedgerRow {
  id: string;
  invoice: InvoiceRecord;
  payment: InvoicePaymentRecord;
}

@Component({
  selector: 'lorne-payments-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Finance" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Payments</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ invoices().length }} invoices</span>
            <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-700">{{ ledgerRows().length }} payments</span>
          </div>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label class="block min-w-64">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Search</span>
              <input class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" placeholder="Owner, property, invoice, reference" [ngModel]="search()" (ngModelChange)="search.set($event)" />
            </label>
            <label class="block sm:w-44">
              <span class="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">Queue</span>
              <select class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" [ngModel]="queue()" (ngModelChange)="queue.set($event)">
                <option value="OPEN">Open balances</option>
                <option value="OVERDUE">Overdue</option>
                <option value="PAID">Paid</option>
                <option value="ALL">All invoices</option>
              </select>
            </label>
            <button pButton type="button" severity="secondary" icon="pi pi-list" label="Invoices" routerLink="/invoices"></button>
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

      <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Outstanding</p>
          <p class="mt-2 text-3xl font-black text-slate-950">{{ currency(outstandingTotal()) }}</p>
          <p class="text-sm font-semibold text-slate-500">{{ openInvoiceCount() }} invoices with balance</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Overdue</p>
          <p class="mt-2 text-3xl font-black text-amber-700">{{ currency(overdueTotal()) }}</p>
          <p class="text-sm font-semibold text-slate-500">{{ overdueInvoiceCount() }} invoices need follow-up</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Collected</p>
          <p class="mt-2 text-3xl font-black text-teal-700">{{ currency(collectedTotal()) }}</p>
          <p class="text-sm font-semibold text-slate-500">Recorded payments in ledger</p>
        </article>
        <article class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p class="text-xs font-black uppercase tracking-wide text-slate-500">Reconciliation</p>
          <p class="mt-2 text-3xl font-black text-slate-950">{{ pendingPaymentCount() }}</p>
          <p class="text-sm font-semibold text-slate-500">Pending, failed, or refunded payments</p>
        </article>
      </section>

      <section class="grid min-h-[44rem] gap-3 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <article class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-2 border-b border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ queueHeading() }}</p>
              <h2 class="text-lg font-black text-slate-950">{{ filteredInvoices().length }} matching invoices</h2>
            </div>
            <p class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Click a row to record a payment</p>
          </div>

          <div class="max-h-[44rem] overflow-auto">
            <table class="w-full min-w-[48rem] border-collapse text-sm">
              <thead class="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">Invoice</th>
                  <th class="px-3 py-3">Owner</th>
                  <th class="px-3 py-3">Property</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3 text-right">Balance</th>
                  <th class="w-28 px-3 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (invoice of filteredInvoices(); track invoice.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [class.bg-teal-50]="selectedInvoice()?.id === invoice.id" (click)="selectInvoice(invoice)">
                    <td class="px-3 py-3">
                      <p class="font-black text-slate-950">{{ invoice.invoiceNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">Due {{ invoice.dueOn || '-' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-800">{{ invoice.ownerName }}</p>
                      @if (invoice.ownerCode) {
                        <p class="mt-1 inline-flex rounded-full bg-teal-50 px-2 py-0.5 font-mono text-[0.68rem] font-black uppercase tracking-wide text-teal-700">{{ invoice.ownerCode }}</p>
                      }
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-teal-700">{{ invoice.propertyName || '-' }}</p>
                      @if (invoice.propertyCode) {
                        <p class="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[0.68rem] font-black uppercase tracking-wide text-slate-600">{{ invoice.propertyCode }}</p>
                      }
                    </td>
                    <td class="px-3 py-3"><p-tag [value]="statusText(invoice.status)" [severity]="statusSeverity(invoice.status)" /></td>
                    <td class="px-3 py-3 text-right font-black text-slate-950">{{ currency(invoice.balanceDue) }}</td>
                    <td class="px-3 py-3 text-right">
                      <button pButton type="button" size="small" icon="pi pi-credit-card" label="Record" [disabled]="!isPayable(invoice)" (click)="openPayment(invoice); $event.stopPropagation()"></button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="px-3 py-12 text-center text-sm font-semibold text-slate-500">No invoices match this payment queue.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </article>

        <article class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-2 border-b border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Payment ledger</p>
              <h2 class="text-lg font-black text-slate-950">Collected and adjusted payments</h2>
            </div>
            @if (selectedInvoice(); as invoice) {
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-times" label="Clear invoice filter" (click)="selectedInvoice.set(null)"></button>
            }
          </div>

          <div class="max-h-[44rem] overflow-auto">
            <table class="w-full min-w-[54rem] border-collapse text-sm">
              <thead class="sticky top-0 bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">Paid</th>
                  <th class="px-3 py-3">Invoice</th>
                  <th class="px-3 py-3">Owner</th>
                  <th class="px-3 py-3">Method</th>
                  <th class="px-3 py-3">Reference</th>
                  <th class="px-3 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (row of visibleLedgerRows(); track row.id) {
                  <tr class="hover:bg-slate-50">
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-800">{{ row.payment.paidAt || row.payment.createdAt | date:'MMM d, y' }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ row.payment.paidAt || row.payment.createdAt | date:'h:mm a' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-black text-teal-700">{{ row.invoice.invoiceNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ row.invoice.propertyName || '-' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-800">{{ row.invoice.ownerName }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ row.invoice.ownerBillingEmail || row.invoice.ownerEmail || '-' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p-tag [value]="methodText(row.payment.paymentMethod)" severity="info" />
                      @if (row.payment.status !== 'RECEIVED') {
                        <p class="mt-1"><p-tag [value]="row.payment.status.toLowerCase()" [severity]="paymentStatusSeverity(row.payment.status)" /></p>
                      }
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-700">{{ row.payment.reference || '-' }}</p>
                      @if (row.payment.note) {
                        <p class="mt-1 line-clamp-2 text-xs text-slate-500">{{ row.payment.note }}</p>
                      }
                    </td>
                    <td class="px-3 py-3 text-right font-black text-slate-950">{{ currency(row.payment.amount) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="px-3 py-12 text-center text-sm font-semibold text-slate-500">No payments recorded for the current filter.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <p-dialog header="Record payment" [modal]="true" [visible]="showPayment()" [style]="{ width: 'min(40rem, 94vw)' }" (visibleChange)="showPayment.set($event)">
        <form class="space-y-3" (ngSubmit)="recordPayment()">
          @if (paymentTarget(); as invoice) {
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Invoice {{ invoice.invoiceNumber }}</p>
              <h3 class="mt-1 text-lg font-black text-slate-950">{{ invoice.ownerName }}</h3>
              <p class="text-sm font-semibold text-slate-500">{{ invoice.propertyName || 'No property' }}</p>
              <p class="mt-2 text-sm font-semibold text-slate-700">Balance due: <strong>{{ currency(invoice.balanceDue) }}</strong></p>
            </div>
          }

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Amount</span>
              <input class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" type="number" min="0.01" step="0.01" name="paymentAmount" [(ngModel)]="paymentForm.amount" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Payment date</span>
              <input class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" type="datetime-local" name="paymentPaidAt" [(ngModel)]="paymentForm.paidAt" />
            </label>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Method</span>
              <select class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" name="paymentMethod" [(ngModel)]="paymentForm.paymentMethod">
                <option value="E_TRANSFER">E-transfer</option>
                <option value="CASH">Cash</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="OTHER">Other</option>
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-bold text-slate-700">Reference</span>
              <input class="h-11 w-full rounded-md border border-slate-300 px-3 text-sm" name="paymentReference" placeholder="Cheque, transfer, card ref" [(ngModel)]="paymentForm.reference" />
            </label>
          </div>

          <label class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Note</span>
            <textarea class="min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" name="paymentNote" placeholder="Internal reconciliation note" [(ngModel)]="paymentForm.note"></textarea>
          </label>

          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showPayment.set(false)"></button>
            <button pButton type="submit" icon="pi pi-check" label="Record payment" [loading]="savingPayment()"></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class PaymentsPageComponent {
  private readonly invoiceService = inject(InvoiceService);

  protected readonly invoices = signal<InvoiceRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly savingPayment = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');
  protected readonly search = signal('');
  protected readonly queue = signal<PaymentQueue>('OPEN');
  protected readonly selectedInvoice = signal<InvoiceRecord | null>(null);
  protected readonly paymentTarget = signal<InvoiceRecord | null>(null);
  protected readonly showPayment = signal(false);

  protected readonly paymentForm = {
    amount: 0,
    paymentMethod: 'E_TRANSFER' as PaymentMethod,
    paidAt: dateTimeInput(new Date()),
    reference: '',
    note: ''
  };

  protected readonly filteredInvoices = computed(() => {
    const term = normalize(this.search());
    return this.invoices()
      .filter((invoice) => this.invoiceMatchesQueue(invoice))
      .filter((invoice) => !term || normalize(invoiceSearchText(invoice)).includes(term))
      .sort((left, right) => {
        const balanceDiff = numberValue(right.balanceDue) - numberValue(left.balanceDue);
        return balanceDiff || String(left.dueOn || '').localeCompare(String(right.dueOn || ''));
      });
  });

  protected readonly ledgerRows = computed<PaymentLedgerRow[]>(() => this.invoices().flatMap((invoice) =>
    (invoice.payments || []).map((payment) => ({ id: `${invoice.id}:${payment.id}`, invoice, payment }))
  ).sort((left, right) => paymentDate(right).getTime() - paymentDate(left).getTime()));

  protected readonly visibleLedgerRows = computed(() => {
    const selected = this.selectedInvoice();
    const term = normalize(this.search());
    return this.ledgerRows()
      .filter((row) => !selected || row.invoice.id === selected.id)
      .filter((row) => !term || normalize(`${invoiceSearchText(row.invoice)} ${row.payment.reference || ''} ${row.payment.note || ''}`).includes(term));
  });

  protected readonly outstandingTotal = computed(() => this.invoices().reduce((sum, invoice) => sum + Math.max(numberValue(invoice.balanceDue), 0), 0));
  protected readonly collectedTotal = computed(() => this.ledgerRows().reduce((sum, row) => sum + numberValue(row.payment.amount), 0));
  protected readonly overdueTotal = computed(() => this.invoices().filter((invoice) => this.isOverdue(invoice)).reduce((sum, invoice) => sum + Math.max(numberValue(invoice.balanceDue), 0), 0));
  protected readonly openInvoiceCount = computed(() => this.invoices().filter((invoice) => this.isPayable(invoice)).length);
  protected readonly overdueInvoiceCount = computed(() => this.invoices().filter((invoice) => this.isOverdue(invoice)).length);
  protected readonly pendingPaymentCount = computed(() => this.ledgerRows().filter((row) => row.payment.status !== 'RECEIVED').length);
  protected readonly queueHeading = computed(() => {
    switch (this.queue()) {
      case 'OVERDUE':
        return 'Overdue invoices';
      case 'PAID':
        return 'Paid invoices';
      case 'ALL':
        return 'All invoices';
      default:
        return 'Open balances';
    }
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const invoices = await firstValueFrom(this.invoiceService.list());
      this.invoices.set(invoices || []);
      const selected = this.selectedInvoice();
      if (selected) {
        this.selectedInvoice.set(this.invoices().find((invoice) => invoice.id === selected.id) || null);
      }
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load payment records.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected selectInvoice(invoice: InvoiceRecord): void {
    this.selectedInvoice.set(invoice);
  }

  protected openPayment(invoice: InvoiceRecord): void {
    if (!this.isPayable(invoice)) {
      this.error.set('Payments can only be recorded after an invoice is sent or marked overdue.');
      return;
    }
    this.paymentTarget.set(invoice);
    this.paymentForm.amount = Number(invoice.balanceDue || 0);
    this.paymentForm.paymentMethod = 'E_TRANSFER';
    this.paymentForm.paidAt = dateTimeInput(new Date());
    this.paymentForm.reference = '';
    this.paymentForm.note = '';
    this.showPayment.set(true);
  }

  protected async recordPayment(): Promise<void> {
    const invoice = this.paymentTarget();
    if (!invoice || this.savingPayment()) {
      return;
    }
    const amount = Number(this.paymentForm.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.error.set('Enter a payment amount greater than zero.');
      return;
    }
    if (amount > numberValue(invoice.balanceDue)) {
      this.error.set('Payment amount cannot be higher than the invoice balance.');
      return;
    }

    this.savingPayment.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const updated = await firstValueFrom(this.invoiceService.recordPayment(invoice.id, {
        amount,
        paymentMethod: this.paymentForm.paymentMethod,
        paidAt: dateTimeInputToIso(this.paymentForm.paidAt),
        reference: trimToUndefined(this.paymentForm.reference),
        note: trimToUndefined(this.paymentForm.note)
      }));
      this.invoices.update((invoices) => invoices.map((candidate) => candidate.id === updated.id ? updated : candidate));
      this.selectedInvoice.set(updated);
      this.paymentTarget.set(updated);
      this.showPayment.set(false);
      this.message.set(`Payment recorded for ${updated.invoiceNumber}.`);
      await this.load();
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to record payment.'));
    } finally {
      this.savingPayment.set(false);
    }
  }

  protected currency(value: number): string {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(Number(value || 0));
  }

  protected numberValue(value: number): number {
    return numberValue(value);
  }

  protected statusText(status: InvoiceStatus): string {
    return status.toLowerCase().replaceAll('_', ' ');
  }

  protected statusSeverity(status: InvoiceStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'PARTIALLY_PAID':
      case 'SENT':
        return 'info';
      case 'OVERDUE':
        return 'warn';
      case 'VOID':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  protected paymentStatusSeverity(status: InvoicePaymentRecord['status']): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'RECEIVED':
        return 'success';
      case 'PENDING':
        return 'warn';
      case 'FAILED':
      case 'REFUNDED':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  protected methodText(method: PaymentMethod): string {
    return method.toLowerCase().replaceAll('_', ' ');
  }

  protected isPayable(invoice: InvoiceRecord): boolean {
    return numberValue(invoice.balanceDue) > 0
      && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status);
  }

  private invoiceMatchesQueue(invoice: InvoiceRecord): boolean {
    switch (this.queue()) {
      case 'OVERDUE':
        return this.isOverdue(invoice);
      case 'PAID':
        return invoice.status === 'PAID' || numberValue(invoice.balanceDue) <= 0;
      case 'ALL':
        return true;
      default:
        return this.isPayable(invoice);
    }
  }

  private isOverdue(invoice: InvoiceRecord): boolean {
    if (invoice.status === 'OVERDUE') {
      return numberValue(invoice.balanceDue) > 0;
    }
    if (!invoice.dueOn || numberValue(invoice.balanceDue) <= 0 || ['DRAFT', 'VOID', 'PAID'].includes(invoice.status)) {
      return false;
    }
    const due = new Date(`${invoice.dueOn}T23:59:59`);
    return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
  }
}

function invoiceSearchText(invoice: InvoiceRecord): string {
  return [
    invoice.invoiceNumber,
    invoice.ownerName,
    invoice.ownerCode,
    invoice.ownerEmail,
    invoice.ownerBillingEmail,
    invoice.propertyName,
    invoice.propertyCode,
    invoice.propertyAddress,
    invoice.workOrderNumber,
    invoice.workOrderTitle,
    ...(invoice.workOrders || []).flatMap((workOrder) => [workOrder.workOrderNumber, workOrder.title, workOrder.propertyName, workOrder.propertyCode, workOrder.propertyAddress])
  ].filter(Boolean).join(' ');
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function numberValue(value: number | undefined | null): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function paymentDate(row: PaymentLedgerRow): Date {
  const date = new Date(row.payment.paidAt || row.payment.createdAt);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function dateTimeInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function dateTimeInputToIso(value: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function trimToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
