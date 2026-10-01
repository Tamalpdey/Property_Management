import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type { EmailDeliveryLogRecord, ResendEmailDeliveryRequest, TenantSettingsRecord } from '@lorne/contracts';
import { emailBodyText, emailPreviewDocument, renderEmailBody } from '../../shared/email-body-text';
import { TenantSettingsService } from '../settings/services/tenant-settings.service';

@Component({
  selector: 'lorne-email-audit-page',
  standalone: true,
  imports: [ButtonModule, DatePipe, DialogModule, FormsModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Communications" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Email audit</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ logs().length }} records</span>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
      </div>

      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <section class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="audit-header grid grid-cols-[10rem_1.1fr_1.1fr_1.2fr_0.9fr_0.8fr_11rem] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500">
          <span>Sent</span>
          <span>Type</span>
          <span>Related</span>
          <span>Recipients</span>
          <span>Status</span>
          <span>Provider</span>
          <span class="text-right">Actions</span>
        </div>

        @if (loading()) {
          <p class="px-3 py-10 text-center text-sm font-semibold text-slate-500">Loading email delivery records...</p>
        } @else {
          <div class="divide-y divide-slate-100">
            @for (log of logs(); track log.id) {
              <article class="audit-row grid grid-cols-[10rem_1.1fr_1.1fr_1.2fr_0.9fr_0.8fr_11rem] gap-2 px-3 py-2.5 text-sm">
                <div class="font-semibold text-slate-600">{{ (log.sentAt || log.createdAt) | date:'MMM d, h:mm a' }}</div>
                <div class="min-w-0">
                  <p class="truncate font-black text-slate-950">{{ messageSubject(log) }}</p>
                  <p class="mt-0.5 text-xs font-semibold text-slate-500">{{ emailTypeLabel(log.communicationType) }} · {{ log.deliveryMode.toLowerCase() }}</p>
                </div>
                <div class="min-w-0">
                  <p class="truncate font-bold text-teal-800">{{ relatedLabel(log) }}</p>
                  @if (log.ownerName) {
                    <p class="truncate text-xs font-semibold text-slate-500">{{ log.ownerName }}</p>
                  }
                </div>
                <div class="min-w-0">
                  <p class="truncate font-bold text-slate-700">To: {{ log.recipientEmail }}</p>
                  @if (log.ccEmails || log.bccEmails) {
                    <p class="truncate text-xs font-semibold text-slate-500">
                      @if (log.ccEmails) { CC: {{ log.ccEmails }} }
                      @if (log.bccEmails) { BCC: {{ log.bccEmails }} }
                    </p>
                  }
                </div>
                <div>
                  <p-tag [value]="log.status.toLowerCase()" [severity]="emailStatusSeverity(log.status)" />
                  <p class="mt-1 text-xs font-black uppercase text-slate-500">{{ log.deliveryMode }}</p>
                </div>
                <p class="line-clamp-2 text-xs font-semibold text-slate-500">{{ log.providerMessage || 'Recorded delivery attempt.' }}</p>
                <div class="flex justify-end gap-1">
                  <button pButton type="button" size="small" severity="secondary" icon="pi pi-eye" label="View" (click)="openMessage(log)"></button>
                  <button pButton type="button" size="small" severity="secondary" icon="pi pi-send" label="Resend" (click)="openResend(log)"></button>
                </div>
              </article>
            } @empty {
              <p class="px-3 py-12 text-center text-sm font-semibold text-slate-500">No email delivery records yet.</p>
            }
          </div>
        }
      </section>

      <p-dialog header="Email message" [modal]="true" [visible]="messageOpen()" [style]="{ width: 'min(52rem, 96vw)' }" (visibleChange)="!$event && closeMessage()">
        @if (selectedMessage(); as log) {
          <div class="space-y-3">
            <div class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
              <div><span class="field-label">Subject</span><p class="font-bold text-slate-950">{{ messageSubject(log) }}</p></div>
              <div><span class="field-label">Sent</span><p class="font-bold text-slate-700">{{ (log.sentAt || log.createdAt) | date:'MMM d, yyyy, h:mm a' }}</p></div>
              <div><span class="field-label">To</span><p class="break-words font-bold text-slate-700">{{ log.recipientEmail }}</p></div>
              <div><span class="field-label">Related</span><p class="font-bold text-teal-800">{{ relatedLabel(log) }}</p></div>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="field-label mb-0">Complete message</span>
              <div class="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                <button pButton type="button" size="small" icon="pi pi-desktop" label="Email preview" [text]="messageView() !== 'HTML'" (click)="messageView.set('HTML')"></button>
                <button pButton type="button" size="small" icon="pi pi-align-left" label="Plain text" [text]="messageView() !== 'TEXT'" (click)="messageView.set('TEXT')"></button>
              </div>
            </div>
            <div class="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white">
              @if (messageView() === 'HTML') {
                <iframe title="Email message preview" class="h-[58vh] w-full border-0 bg-white" sandbox="" referrerpolicy="no-referrer" [srcdoc]="messageHtml()"></iframe>
              } @else {
                <div class="max-h-[58vh] overflow-y-auto whitespace-pre-wrap p-4 text-sm font-medium leading-6 text-slate-700">{{ messageBody(log) }}</div>
              }
            </div>
            <div class="flex justify-end border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" label="Close" (click)="closeMessage()"></button>
            </div>
          </div>
        }
      </p-dialog>

      <p-dialog header="Resend email" [modal]="true" [visible]="resendOpen()" [style]="{ width: 'min(44rem, 94vw)' }" (visibleChange)="!$event && closeResend()">
        @if (selectedLog(); as log) {
          <form class="space-y-3" (ngSubmit)="resend()">
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-sm font-black text-slate-950">{{ log.subject || emailTypeLabel(log.communicationType) }}</p>
              <p class="mt-1 text-xs font-semibold text-slate-500">Original send: {{ (log.sentAt || log.createdAt) | date:'MMM d, h:mm a' }} · {{ relatedLabel(log) }}</p>
            </div>
            <label class="block">
              <span class="field-label">To</span>
              <input class="field-input" name="resendRecipientEmail" type="email" [(ngModel)]="resendForm.recipientEmail" required />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <label class="block">
                <span class="field-label">CC</span>
                <input class="field-input" name="resendCcEmails" placeholder="comma separated" [(ngModel)]="resendForm.ccEmails" />
              </label>
              <label class="block">
                <span class="field-label">BCC</span>
                <input class="field-input" name="resendBccEmails" placeholder="comma separated" [(ngModel)]="resendForm.bccEmails" />
              </label>
            </div>
            <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Resending creates a new audited delivery attempt. The original audit record remains unchanged.
            </p>
            <div class="flex justify-end gap-2 border-t border-slate-200 pt-3">
              <button pButton type="button" severity="secondary" label="Cancel" (click)="closeResend()"></button>
              <button pButton type="submit" icon="pi pi-send" label="Resend email" [loading]="resending()" [disabled]="!resendForm.recipientEmail || resending()"></button>
            </div>
          </form>
        }
      </p-dialog>
    </section>
  `,
  styles: [`
    .field-label { display: block; margin-bottom: 0.25rem; font-size: 0.78rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em; color: #475569; }
    .field-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 0.62rem 0.75rem; font-size: 0.92rem; color: #0f172a; outline: none; background: #fff; }
    .field-input:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12); }
    @media (max-width: 1024px) {
      .audit-row {
        grid-template-columns: 1fr !important;
      }
      .audit-header {
        display: none;
      }
    }
  `]
})
export class EmailAuditPageComponent {
  private readonly tenantSettingsService = inject(TenantSettingsService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly loading = signal(false);
  protected readonly resending = signal(false);
  protected readonly logs = signal<EmailDeliveryLogRecord[]>([]);
  protected readonly tenantSettings = signal<TenantSettingsRecord | null>(null);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly resendOpen = signal(false);
  protected readonly messageOpen = signal(false);
  protected readonly messageView = signal<'HTML' | 'TEXT'>('HTML');
  protected readonly selectedLog = signal<EmailDeliveryLogRecord | null>(null);
  protected readonly selectedMessage = signal<EmailDeliveryLogRecord | null>(null);
  protected readonly messageHtml = computed<SafeHtml>(() => {
    const log = this.selectedMessage();
    return this.sanitizer.bypassSecurityTrustHtml(emailPreviewDocument(log?.body, log ? this.messageValues(log) : {}));
  });
  protected readonly resendForm: ResendEmailDeliveryRequest = {
    recipientEmail: '',
    ccEmails: '',
    bccEmails: ''
  };
  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [logs, tenantSettings] = await Promise.all([
        firstValueFrom(this.tenantSettingsService.emailDeliveries(100)),
        firstValueFrom(this.tenantSettingsService.get())
      ]);
      this.logs.set(logs);
      this.tenantSettings.set(tenantSettings);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load email audit.'));
      this.logs.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  protected openResend(log: EmailDeliveryLogRecord): void {
    this.selectedLog.set(log);
    this.resendForm.recipientEmail = log.recipientEmail || '';
    this.resendForm.ccEmails = log.ccEmails || '';
    this.resendForm.bccEmails = log.bccEmails || '';
    this.message.set('');
    this.error.set('');
    this.resendOpen.set(true);
  }

  protected openMessage(log: EmailDeliveryLogRecord): void {
    this.selectedMessage.set(log);
    this.messageView.set('HTML');
    this.messageOpen.set(true);
  }

  protected closeMessage(): void {
    this.messageOpen.set(false);
    this.selectedMessage.set(null);
  }

  protected messageBody(log: EmailDeliveryLogRecord): string {
    return emailBodyText(log.body, this.messageValues(log)) || 'No message body was recorded.';
  }

  protected messageSubject(log: EmailDeliveryLogRecord): string {
    return renderEmailBody(log.subject, this.messageValues(log)) || this.emailTypeLabel(log.communicationType);
  }

  private messageValues(log: EmailDeliveryLogRecord): Record<string, string> {
    return {
      serviceName: log.serviceName || '',
      workOrderNumber: log.workOrderNumber || '',
      invoiceNumber: log.invoiceNumber || '',
      ownerName: log.ownerName || '',
      tenantLogoUrl: this.tenantSettings()?.logoUrl || ''
    };
  }

  protected closeResend(): void {
    this.resendOpen.set(false);
    this.selectedLog.set(null);
  }

  protected async resend(): Promise<void> {
    const log = this.selectedLog();
    if (!log || this.resending()) {
      return;
    }
    this.resending.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const result = await firstValueFrom(this.tenantSettingsService.resendEmailDelivery(log.id, {
        recipientEmail: this.resendForm.recipientEmail?.trim(),
        ccEmails: this.resendForm.ccEmails?.trim(),
        bccEmails: this.resendForm.bccEmails?.trim()
      }));
      this.message.set(result.status === 'SENT'
        ? `Email resent to ${result.recipientEmail}.`
        : `Resend recorded for ${result.recipientEmail}: ${result.providerMessage || result.status}`);
      this.closeResend();
      await this.load();
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to resend email.'));
    } finally {
      this.resending.set(false);
    }
  }

  protected emailTypeLabel(type: string): string {
    if (type === 'INVOICE_EMAIL') {
      return 'Invoice email';
    }
    if (type === 'WORK_ORDER_COMPLETION') {
      return 'Work completed email';
    }
    if (type === 'TEST_EMAIL') {
      return 'Test email';
    }
    return 'Owner email';
  }

  protected relatedLabel(log: EmailDeliveryLogRecord): string {
    return log.invoiceNumber || log.workOrderNumber || 'Tenant email';
  }

  protected emailStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'SENT') {
      return 'success';
    }
    if (status === 'FAILED') {
      return 'danger';
    }
    if (status === 'RECORDED') {
      return 'warn';
    }
    return 'secondary';
  }
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
