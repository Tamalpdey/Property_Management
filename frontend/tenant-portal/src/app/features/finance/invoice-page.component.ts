import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EmailTemplateRecord, InvoiceRecord } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { InvoiceService } from './services/invoice.service';
import { EmailTemplateService } from '../notifications/services/email-template.service';

@Component({
  selector: 'lorne-invoice-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Finance" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Invoices</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ invoices().length }} records</span>
          </div>
          <div class="flex flex-wrap gap-2">
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

      <section class="grid gap-3 xl:grid-cols-[1fr_24rem]">
        <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[64rem] border-collapse text-sm">
              <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-3 py-3">Invoice</th>
                  <th class="px-3 py-3">Owner</th>
                  <th class="px-3 py-3">Property</th>
                  <th class="px-3 py-3">Status</th>
                  <th class="px-3 py-3">Due</th>
                  <th class="px-3 py-3 text-right">Total</th>
                  <th class="w-32 px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (invoice of invoices(); track invoice.id) {
                  <tr class="cursor-pointer hover:bg-slate-50" [class.bg-teal-50]="selectedInvoice()?.id === invoice.id" (click)="select(invoice)">
                    <td class="px-3 py-3">
                      <p class="font-black text-slate-950">{{ invoice.invoiceNumber }}</p>
                      <p class="text-xs font-semibold text-slate-500">{{ invoice.workOrderNumber || 'No work order' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-slate-800">{{ invoice.ownerName }}</p>
                      <p class="text-xs text-slate-500">{{ invoice.ownerBillingEmail || invoice.ownerEmail || 'No billing email' }}</p>
                    </td>
                    <td class="px-3 py-3">
                      <p class="font-semibold text-teal-700">{{ invoice.propertyName || 'No property' }}</p>
                      <p class="line-clamp-1 text-xs text-slate-500">{{ invoice.workOrderTitle || 'No service title' }}</p>
                    </td>
                    <td class="px-3 py-3"><p-tag [value]="statusText(invoice.status)" [severity]="statusSeverity(invoice.status)" /></td>
                    <td class="px-3 py-3 text-slate-600">{{ invoice.dueOn || '-' }}</td>
                    <td class="px-3 py-3 text-right font-black text-slate-950">{{ currency(invoice.total) }}</td>
                    <td class="px-3 py-3 text-right">
                      <button pButton type="button" text rounded icon="pi pi-print" (click)="printInvoice(invoice); $event.stopPropagation()"></button>
                      <button pButton type="button" text rounded icon="pi pi-download" (click)="downloadPdf(invoice); $event.stopPropagation()"></button>
                      <button pButton type="button" text rounded icon="pi pi-send" [disabled]="!ownerEmail(invoice)" (click)="openSend(invoice); $event.stopPropagation()"></button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No invoices generated yet.</td>
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
            <div class="mt-3 grid gap-2">
              @for (line of invoice.lines; track line.id) {
                <div class="rounded-lg bg-slate-50 px-3 py-2">
                  <p class="text-sm font-black text-slate-950">{{ line.description }}</p>
                  <p class="mt-1 text-xs font-semibold text-slate-500">{{ line.quantity }} x {{ currency(line.unitPrice) }}</p>
                  <p class="mt-1 text-sm font-black text-slate-800">{{ currency(line.lineTotal) }}</p>
                </div>
              } @empty {
                <p class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-8 text-center text-sm font-semibold text-slate-500">No line items.</p>
              }
            </div>
            <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p class="flex justify-between text-sm"><span>Subtotal</span><strong>{{ currency(invoice.subtotal) }}</strong></p>
              <p class="mt-1 flex justify-between text-sm"><span>Tax</span><strong>{{ currency(invoice.taxTotal) }}</strong></p>
              <p class="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base"><span>Total</span><strong>{{ currency(invoice.total) }}</strong></p>
            </div>
            <div class="mt-3 grid gap-2">
              <button pButton type="button" icon="pi pi-print" label="Print invoice" (click)="printInvoice(invoice)"></button>
              <button pButton type="button" severity="secondary" icon="pi pi-download" label="Download PDF" [loading]="downloading()" (click)="downloadPdf(invoice)"></button>
              <button pButton type="button" severity="secondary" icon="pi pi-send" label="Email owner" [disabled]="!ownerEmail(invoice)" (click)="openSend(invoice)"></button>
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
          <label class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Subject</span>
            <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="subject" [(ngModel)]="sendForm.subject" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Message</span>
            <textarea class="min-h-64 w-full border border-slate-300 px-3 py-2 text-sm" name="body" [(ngModel)]="sendForm.body"></textarea>
          </label>
          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showSend.set(false)"></button>
            <button pButton type="submit" icon="pi pi-send" label="Send invoice" [loading]="saving()"></button>
          </div>
        </form>
      </p-dialog>

    </section>
  `
})
export class InvoicePageComponent {
  private readonly invoiceService = inject(InvoiceService);
  private readonly emailTemplateService = inject(EmailTemplateService);
  protected readonly invoices = signal<InvoiceRecord[]>([]);
  protected readonly selectedInvoice = signal<InvoiceRecord | null>(null);
  protected readonly template = signal<EmailTemplateRecord | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly downloading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly showSend = signal(false);
  protected readonly sendTarget = signal<InvoiceRecord | null>(null);
  protected readonly sendForm = { recipientEmail: '', subject: '', body: '' };

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [invoices, template] = await Promise.all([
        firstValueFrom(this.invoiceService.list()),
        firstValueFrom(this.emailTemplateService.invoiceOwner())
      ]);
      this.invoices.set(invoices);
      this.template.set(template);
      this.selectedInvoice.set(invoices[0] ?? null);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load invoices.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected select(invoice: InvoiceRecord): void {
    this.selectedInvoice.set(invoice);
  }

  protected ownerEmail(invoice: InvoiceRecord): string {
    return invoice.ownerBillingEmail || invoice.ownerEmail || '';
  }

  protected openSend(invoice: InvoiceRecord): void {
    const template = this.template();
    this.sendTarget.set(invoice);
    this.sendForm.recipientEmail = this.ownerEmail(invoice);
    this.sendForm.subject = render(template?.subject || 'Invoice {{invoiceNumber}}', invoice);
    this.sendForm.body = render(template?.body || '', invoice);
    this.showSend.set(true);
  }

  protected async sendInvoiceEmail(): Promise<void> {
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
    printWindow.document.write(invoicePrintHtml(invoice));
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
    if (status === 'VOID') {
      return 'danger';
    }
    return 'info';
  }

  protected currency(value: string | number): string {
    return currencyText(value);
  }
}

function render(template: string, invoice: InvoiceRecord): string {
  const values: Record<string, string> = {
    invoiceNumber: invoice.invoiceNumber,
    ownerName: invoice.ownerName,
    propertyName: invoice.propertyName || '',
    propertyAddress: invoice.propertyAddress || '',
    workOrderNumber: invoice.workOrderNumber || '',
    workOrderTitle: invoice.workOrderTitle || '',
    invoiceSubtotal: currencyText(invoice.subtotal),
    invoiceTax: currencyText(invoice.taxTotal),
    invoiceTotal: currencyText(invoice.total),
    issuedOn: invoice.issuedOn || '',
    dueOn: invoice.dueOn || '',
    tenantName: 'Lorne PropertyOps'
  };
  return Object.entries(values).reduce((body, [key, value]) => body.replaceAll(`{{${key}}}`, value), template);
}

function invoicePrintHtml(invoice: InvoiceRecord): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoiceNumber)}</title><style>
    @page { size: letter; margin: 0.45in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111827; font-family: Inter, Arial, sans-serif; font-size: 10.5pt; line-height: 1.35; }
    header { display: flex; justify-content: space-between; gap: 24pt; border-bottom: 2px solid #111827; padding-bottom: 12pt; margin-bottom: 12pt; }
    h1 { margin: 0; font-size: 24pt; }
    h2 { margin: 0 0 6pt; color: #0f766e; font-size: 10pt; letter-spacing: 0.05em; text-transform: uppercase; }
    p { margin: 2pt 0; }
    section { break-inside: avoid; border: 1px solid #d1d5db; padding: 8pt; margin-bottom: 8pt; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { border: 1px solid #d1d5db; padding: 6pt; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 800; }
    .right { text-align: right; }
    .total { font-size: 14pt; font-weight: 800; }
    .eyebrow { color: #0f766e; font-size: 8pt; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
  </style></head><body>
    <header>
      <div><p class="eyebrow">Invoice</p><h1>${escapeHtml(invoice.invoiceNumber)}</h1><p>${escapeHtml(invoice.status)}</p></div>
      <div class="right"><p><strong>Issued:</strong> ${escapeHtml(invoice.issuedOn || '-')}</p><p><strong>Due:</strong> ${escapeHtml(invoice.dueOn || '-')}</p></div>
    </header>
    <div class="grid">
      <section><h2>Bill To</h2><p><strong>${escapeHtml(invoice.ownerName)}</strong></p><p>${escapeHtml(invoice.ownerBillingEmail || invoice.ownerEmail || '')}</p></section>
      <section><h2>Property / Work</h2><p><strong>${escapeHtml(invoice.propertyName || '')}</strong></p><p>${escapeHtml(invoice.propertyAddress || '')}</p><p>${escapeHtml(invoice.workOrderNumber || '')} · ${escapeHtml(invoice.workOrderTitle || '')}</p></section>
    </div>
    <section><h2>Line Items</h2>${invoiceTable(invoice)}</section>
    <section><p class="right">Subtotal: <strong>${escapeHtml(currencyText(invoice.subtotal))}</strong></p><p class="right">Tax: <strong>${escapeHtml(currencyText(invoice.taxTotal))}</strong></p><p class="right total">Total: ${escapeHtml(currencyText(invoice.total))}</p></section>
  </body></html>`;
}

function invoiceTable(invoice: InvoiceRecord): string {
  if (invoice.lines.length === 0) {
    return '<p>No line items.</p>';
  }
  return `<table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th class="right">Line total</th></tr></thead><tbody>${invoice.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(currencyText(line.unitPrice))}</td><td class="right">${escapeHtml(currencyText(line.lineTotal))}</td></tr>`).join('')}</tbody></table>`;
}

function currencyText(value: string | number): string {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
    : '$0.00';
}

function escapeHtml(value: string | number | boolean): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
