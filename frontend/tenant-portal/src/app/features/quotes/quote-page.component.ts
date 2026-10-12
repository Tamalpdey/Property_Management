import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AuditLogRecord, PropertyOwner, PropertyRecord, QuoteRecord, QuoteStatus, ServiceType, UpsertQuoteRequest } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PropertyOwnerService } from '../owners/services/property-owner.service';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { VoiceNoteButtonComponent } from '../../shared/voice-note-button.component';
import { EmailTemplateService } from '../notifications/services/email-template.service';
import { TenantAuditService } from '../audit/services/tenant-audit.service';
import { QuoteService } from './services/quote.service';

@Component({
  selector: 'lorne-quote-page',
  standalone: true,
  imports: [ButtonModule, CurrencyPipe, DatePipe, DecimalPipe, DialogModule, FormsModule, InputNumberModule, InputTextModule, SelectModule, TagModule, VoiceNoteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <header class="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p class="text-xs font-bold uppercase text-teal-300">Sales workflow</p>
          <h1 class="mt-1 text-2xl font-bold">Quotes</h1>
          <p class="mt-1 text-sm text-slate-300">Prepare client pricing, collect approval, and create the work order when the work is won.</p>
        </div>
        <button pButton type="button" icon="pi pi-plus" label="New quote" (click)="openCreate()"></button>
      </header>

      @if (error()) {
        <div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{{ error() }}</div>
      }
      @if (notice()) {
        <div class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{{ notice() }}</div>
      }

      <div class="grid grid-cols-2 gap-2 md:grid-cols-4">
        @for (metric of metrics(); track metric.label) {
          <button type="button" class="min-h-24 rounded-md border border-slate-200 bg-white p-4 text-left shadow-sm" (click)="setStatus(metric.status)">
            <span class="text-xs font-bold uppercase text-slate-500">{{ metric.label }}</span>
            <strong class="mt-1 block text-2xl text-slate-950">{{ metric.value }}</strong>
            <small class="text-slate-500">{{ metric.detail }}</small>
          </button>
        }
      </div>

      <div class="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,.65fr)]">
        <div class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
          <div class="flex flex-col gap-2 border-b border-slate-200 p-3 sm:flex-row">
            <label class="relative min-w-0 flex-1">
              <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input pInputText class="w-full pl-9" [(ngModel)]="search" (keyup.enter)="load()" placeholder="Search quote, client, property" />
            </label>
            <p-select class="sm:w-48" [options]="statusOptions" optionLabel="label" optionValue="value" [(ngModel)]="status" (onChange)="load()" />
            <button pButton type="button" severity="secondary" icon="pi pi-refresh" title="Refresh" (click)="load()"></button>
          </div>

          @if (loading()) {
            <p class="p-8 text-center text-sm text-slate-500">Loading quotes...</p>
          } @else if (quotes().length === 0) {
            <div class="p-10 text-center">
              <i class="pi pi-file-edit text-3xl text-slate-300"></i>
              <p class="mt-3 font-bold text-slate-800">No quotes found</p>
              <p class="mt-1 text-sm text-slate-500">Create a quote or change the current filters.</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr><th>Quote</th><th>Client</th><th>Valid until</th><th>Total</th><th>Status</th></tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  @for (quote of quotes(); track quote.id) {
                    <tr class="cursor-pointer hover:bg-slate-50" [class.bg-teal-50]="selected()?.id === quote.id" (click)="selected.set(quote)">
                      <td><strong>{{ quote.quoteNumber }}</strong><small>{{ quote.title }}</small></td>
                      <td><strong>{{ quote.customerName }}</strong><small>{{ quote.propertyName || 'No property selected' }}</small></td>
                      <td>{{ quote.validUntil ? (quote.validUntil | date:'mediumDate') : 'Open' }}</td>
                      <td class="font-bold text-slate-950">{{ quote.total | currency }}</td>
                      <td><p-tag [value]="statusLabel(quote.status)" [severity]="severity(quote.status)" /></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>

        <aside class="rounded-md border border-slate-200 bg-white shadow-sm">
          @if (selected(); as quote) {
            <div class="border-b border-slate-200 p-4">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-bold uppercase text-teal-700">{{ quote.quoteNumber }}</p>
                  <h2 class="mt-1 text-xl font-bold text-slate-950">{{ quote.title }}</h2>
                  <p class="mt-1 text-sm text-slate-500">{{ quote.customerName }} @if (quote.propertyName) { <span> · {{ quote.propertyName }}</span> }</p>
                </div>
                <p-tag [value]="statusLabel(quote.status)" [severity]="severity(quote.status)" />
              </div>
              <div class="mt-4 flex flex-wrap gap-2">
                @if (canEdit(quote)) {
                  <button pButton type="button" size="small" severity="secondary" icon="pi pi-pencil" label="Edit" (click)="openEdit(quote)"></button>
                }
                @if (canSend(quote)) {
                  <button pButton type="button" size="small" icon="pi pi-send" label="Send" (click)="openSend(quote)"></button>
                  <button pButton type="button" size="small" severity="secondary" icon="pi pi-share-alt" label="Share link" (click)="openShare(quote)"></button>
                }
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-download" label="PDF" [loading]="downloading()" (click)="downloadPdf(quote)"></button>
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-history" label="History" (click)="openHistory(quote)"></button>
                @if (quote.status === 'APPROVED') {
                  <button pButton type="button" size="small" icon="pi pi-calendar-plus" label="Create work order" (click)="convert(quote)"></button>
                }
                @if (!['APPROVED','CONVERTED','VOID'].includes(quote.status)) {
                  <button pButton type="button" size="small" severity="danger" text icon="pi pi-ban" label="Void" (click)="voidQuote(quote)"></button>
                }
              </div>
            </div>
            <div class="space-y-4 p-4">
              @if (quote.scope) {
                <div><span class="detail-label">Scope</span><p class="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ quote.scope }}</p></div>
              }
              <div class="divide-y divide-slate-100 border-y border-slate-200">
                @for (line of quote.lines; track line.id || line.sortOrder) {
                  <div class="grid grid-cols-[1fr_auto] gap-3 py-3 text-sm">
                    <div><strong class="text-slate-900">{{ line.description }}</strong><small class="mt-1 block text-slate-500">{{ line.quantity }} {{ line.unit || '' }} × {{ line.rate | currency }}</small></div>
                    <strong>{{ line.amount | currency }}</strong>
                  </div>
                }
              </div>
              <dl class="space-y-2 text-sm">
                <div><dt>Subtotal</dt><dd>{{ quote.subtotal | currency }}</dd></div>
                <div><dt>Tax ({{ quote.taxRate * 100 | number:'1.0-2' }}%)</dt><dd>{{ quote.taxAmount | currency }}</dd></div>
                <div class="border-t border-slate-200 pt-2 text-base"><dt>Total</dt><dd>{{ quote.total | currency }}</dd></div>
              </dl>
              @if (quote.approvalName) {
                <div class="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <strong>{{ quote.status === 'APPROVED' ? 'Approved' : 'Responded' }} by {{ quote.approvalName }}</strong>
                  @if (quote.approvalComment) { <p class="mt-1">{{ quote.approvalComment }}</p> }
                </div>
              }
              @if (quote.convertedWorkOrderNumber) {
                <div class="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Work order <strong>{{ quote.convertedWorkOrderNumber }}</strong> created.</div>
              }
            </div>
          } @else {
            <div class="grid min-h-80 place-items-center p-8 text-center text-sm text-slate-500">Select a quote to review details and actions.</div>
          }
        </aside>
      </div>

      <p-dialog [header]="editingId() ? 'Edit quote' : 'Create quote'" [modal]="true" [visible]="editorOpen()" [style]="{ width: 'min(76rem, 96vw)' }" (visibleChange)="!$event && editorOpen.set(false)">
        <div class="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="field sm:col-span-2">
                <div class="flex items-center justify-between gap-2">
                  <span>Client *</span>
                  <button pButton type="button" size="small" text [icon]="form.adhocCustomer ? 'pi pi-list' : 'pi pi-user-plus'" [label]="form.adhocCustomer ? 'Use saved client' : 'One-time client'" (click)="toggleAdhocCustomer()"></button>
                </div>
                @if (form.adhocCustomer) {
                  <div class="grid gap-2 sm:grid-cols-3">
                    <input pInputText [(ngModel)]="form.adhocCustomerName" placeholder="Client name *" />
                    <input pInputText type="email" [(ngModel)]="form.adhocCustomerEmail" placeholder="Email" />
                    <input pInputText type="tel" [(ngModel)]="form.adhocCustomerPhone" placeholder="Phone" />
                  </div>
                } @else {
                  <p-select class="w-full" [options]="ownerOptions()" optionLabel="label" optionValue="value" [(ngModel)]="form.customerId" (onChange)="clientChanged()" placeholder="Select client" />
                }
              </div>
              <div class="field sm:col-span-2">
                <div class="flex items-center justify-between gap-2">
                  <span>Property</span>
                  @if (!form.adhocCustomer) {
                    <button pButton type="button" size="small" text [icon]="form.adhocProperty ? 'pi pi-list' : 'pi pi-map-marker'" [label]="form.adhocProperty ? 'Use saved property' : 'One-time property'" (click)="toggleAdhocProperty()"></button>
                  }
                </div>
                @if (form.adhocProperty) {
                  <div class="grid gap-2 sm:grid-cols-2">
                    <input pInputText [(ngModel)]="form.adhocPropertyName" placeholder="Property name" />
                    <input pInputText [(ngModel)]="form.adhocPropertyAddress" placeholder="Full address" />
                  </div>
                } @else {
                  <p-select class="w-full" [options]="propertyOptions()" optionLabel="label" optionValue="value" [(ngModel)]="form.propertyId" [showClear]="true" [disabled]="!form.customerId" placeholder="Select property" />
                }
              </div>
              <label class="field"><span>Service</span><p-select [options]="serviceOptions()" optionLabel="label" optionValue="value" [(ngModel)]="form.serviceTypeId" [showClear]="true" placeholder="Select service" /></label>
              <label class="field"><span>Valid until</span><input pInputText type="date" [(ngModel)]="form.validUntil" /></label>
              <label class="field sm:col-span-2"><span>Quote title *</span><input pInputText [(ngModel)]="form.title" /></label>
              <label class="field sm:col-span-2">
                <span>Scope</span><textarea rows="4" [(ngModel)]="form.scope"></textarea>
                <lorne-voice-note-button [text]="form.scope" label="Speak scope" (textChange)="form.scope = $event" (error)="error.set($event)" />
              </label>
            </div>
            <aside class="space-y-3">
            <label class="field"><span>Tax rate (%)</span><p-inputnumber [(ngModel)]="form.taxPercent" [min]="0" [max]="100" suffix="%" /></label>
            <label class="field">
              <span>Client notes</span><textarea rows="4" [(ngModel)]="form.notes"></textarea>
              <lorne-voice-note-button [text]="form.notes" label="Speak client note" (textChange)="form.notes = $event" (error)="error.set($event)" />
            </label>
            <label class="field"><span>Terms</span><textarea rows="4" [(ngModel)]="form.terms"></textarea></label>
            <div class="rounded-md bg-slate-950 p-4 text-white">
              <span class="text-xs font-bold uppercase text-slate-400">Quote total</span>
              <strong class="mt-1 block text-2xl">{{ editorTotal() | currency }}</strong>
              <small class="text-slate-400">Includes {{ form.taxPercent || 0 }}% tax</small>
            </div>
            </aside>
          </div>

          <div class="rounded-md border border-slate-200">
            <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <strong>Pricing</strong>
              <button pButton type="button" size="small" text icon="pi pi-plus" label="Add line" (click)="addLine()"></button>
            </div>
            <div class="divide-y divide-slate-100">
              @for (line of form.lines; track $index) {
                <div class="quote-line-grid p-3">
                  <label class="field"><span>Description</span><input pInputText [(ngModel)]="line.description" placeholder="Work or material" /></label>
                  <label class="field"><span>Quantity</span><p-inputnumber styleClass="w-full" inputStyleClass="w-full" [(ngModel)]="line.quantity" [min]="0.01" [minFractionDigits]="0" [maxFractionDigits]="2" /></label>
                  <label class="field"><span>Unit</span><input pInputText [(ngModel)]="line.unit" placeholder="each" /></label>
                  <label class="field"><span>Rate</span><p-inputnumber styleClass="w-full" inputStyleClass="w-full" [(ngModel)]="line.rate" mode="currency" currency="CAD" [min]="0" /></label>
                  <button class="self-end" pButton type="button" severity="danger" text icon="pi pi-trash" title="Remove line" [disabled]="form.lines.length === 1" (click)="removeLine($index)"></button>
                </div>
              }
            </div>
          </div>
        </div>
        <ng-template #footer>
          <button pButton type="button" severity="secondary" label="Cancel" (click)="editorOpen.set(false)"></button>
          <button pButton type="button" icon="pi pi-save" label="Save draft" [loading]="saving()" (click)="save()"></button>
        </ng-template>
      </p-dialog>

      <p-dialog header="Send quote" [modal]="true" [visible]="sendOpen()" [style]="{ width: 'min(42rem, 94vw)' }" (visibleChange)="!$event && sendOpen.set(false)">
        <div class="space-y-4">
          @if (error()) { <p class="text-sm text-red-700" role="alert">{{ error() }}</p> }
          <label class="field"><span>Recipient *</span><input pInputText type="email" [(ngModel)]="sendForm.recipientEmail" /></label>
          <label class="field"><span>Subject</span><input pInputText [(ngModel)]="sendForm.subject" /></label>
          <label class="field"><span>Message</span><textarea rows="5" [(ngModel)]="sendForm.message"></textarea></label>
          <p class="text-xs text-slate-500">Uses your Quote client email template from Email templates.</p>
          <label class="field"><span>Client access password *</span><input pInputText type="text" autocomplete="off" [(ngModel)]="sendForm.accessPassword" minlength="8" maxlength="64" /></label>
          <p class="text-xs leading-5 text-slate-500">The email includes the PDF and protected review link. Share this password separately with the client.</p>
        </div>
        <ng-template #footer>
          <button pButton type="button" severity="secondary" label="Cancel" (click)="sendOpen.set(false)"></button>
          <button pButton type="button" icon="pi pi-send" label="Send quote" [loading]="saving()" [disabled]="emailTemplateLoading()" (click)="send()"></button>
        </ng-template>
      </p-dialog>

      <p-dialog header="Quote history" [modal]="true" [visible]="historyOpen()" [style]="{ width: 'min(48rem, 94vw)' }" (visibleChange)="!$event && historyOpen.set(false)">
        <div class="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <strong>{{ historyQuote()?.quoteNumber }}</strong>
          <button pButton type="button" size="small" severity="secondary" icon="pi pi-refresh" title="Refresh history" [loading]="historyLoading()" (click)="loadHistory()"></button>
        </div>
        @if (historyError()) { <p class="mt-3 text-sm text-red-700" role="alert">{{ historyError() }}</p> }
        @if (historyLoading()) {
          <p class="py-6 text-sm text-slate-500">Loading history...</p>
        } @else {
          <div class="max-h-[65vh] divide-y divide-slate-200 overflow-y-auto">
            @for (entry of history(); track entry.id) {
              <article class="py-4">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <strong class="text-sm text-slate-900">{{ historyLabel(entry.action) }}</strong>
                  <time class="text-xs text-slate-500">{{ entry.createdAt | date:'MMM d, yyyy, h:mm:ss a' }}</time>
                </div>
                <p class="mt-1 text-xs text-slate-500">{{ historyActor(entry) }}</p>
                @if (historyDetails(entry)) { <p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{{ historyDetails(entry) }}</p> }
              </article>
            } @empty { <p class="py-6 text-sm text-slate-500">No history recorded yet.</p> }
          </div>
        }
      </p-dialog>

      <p-dialog header="Share quote" [modal]="true" [visible]="shareOpen()" [style]="{ width: 'min(42rem, 94vw)' }" (visibleChange)="!$event && shareOpen.set(false)">
        <div class="space-y-4">
          @if (error()) { <p class="text-sm text-red-700" role="alert">{{ error() }}</p> }
          <label class="field"><span>Client access password *</span><input pInputText type="text" autocomplete="off" [(ngModel)]="sharePassword" [readonly]="!!shareUrl()" minlength="8" maxlength="64" /></label>
          @if (shareUrl()) {
            <label class="field"><span>Public review link</span><input pInputText class="w-full" [value]="shareUrl()" readonly /></label>
            <button pButton type="button" severity="secondary" icon="pi pi-copy" label="Copy link and password" (click)="copyShare()"></button>
          } @else {
            <p class="text-sm text-slate-500">Creating a new link replaces the previous link and locks the quote for client review.</p>
          }
        </div>
        <ng-template #footer>
          <button pButton type="button" severity="secondary" label="Close" (click)="shareOpen.set(false)"></button>
          @if (!shareUrl()) { <button pButton type="button" icon="pi pi-link" label="Create protected link" [loading]="saving()" (click)="share()"></button> }
        </ng-template>
      </p-dialog>

      <p-dialog header="Create work order" [modal]="true" [visible]="conversionOpen()" [style]="{ width: 'min(36rem, 94vw)' }" (visibleChange)="!$event && conversionOpen.set(false)">
        <div class="space-y-4">
          @if (error()) { <p class="text-sm text-red-700" role="alert">{{ error() }}</p> }
          <label class="field"><span>Work order property *</span><p-select class="w-full" [options]="conversionPropertyOptions()" optionLabel="label" optionValue="value" [(ngModel)]="conversionPropertyId" [filter]="true" appendTo="body" placeholder="Select saved property" /></label>
          <p class="text-sm text-slate-500">The approved quote stays unchanged. This property will be used for the new work order.</p>
        </div>
        <ng-template #footer>
          <button pButton type="button" severity="secondary" label="Cancel" (click)="conversionOpen.set(false)"></button>
          <button pButton type="button" icon="pi pi-calendar-plus" label="Create work order" [loading]="saving()" [disabled]="!conversionPropertyId" (click)="convertSelected()"></button>
        </ng-template>
      </p-dialog>
    </section>
  `,
  styles: `
    th { padding: .78rem 1rem; font-weight: 800; }
    td { padding: .82rem 1rem; color: #475569; vertical-align: middle; }
    td strong, td small { display: block; }
    td small { margin-top: .18rem; color: #64748b; }
    .detail-label, .field > span { display: block; color: #64748b; font-size: .72rem; font-weight: 800; text-transform: uppercase; }
    .field { display: grid; gap: .4rem; min-width: 0; }
    .field > input, .field > p-select, .field > p-inputnumber { min-width: 0; width: 100%; }
    .field textarea { width: 100%; resize: vertical; border: 1px solid #cbd5e1; border-radius: 6px; padding: .65rem .75rem; color: #172033; }
    .quote-line-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: .75rem; }
    .quote-line-grid > * { min-width: 0; }
    @media (min-width: 700px) {
      .quote-line-grid { grid-template-columns: minmax(12rem, 1fr) minmax(5.5rem, .3fr) minmax(6rem, .35fr) minmax(9rem, .45fr) 2.5rem; }
    }
    dl div { display: flex; justify-content: space-between; gap: 1rem; }
    dl dt { color: #64748b; }
    dl dd { margin: 0; font-weight: 800; color: #0f172a; }
  `
})
export class QuotePageComponent {
  private readonly quoteService = inject(QuoteService);
  private readonly ownerService = inject(PropertyOwnerService);
  private readonly propertyService = inject(PropertyService);
  private readonly catalogService = inject(ServiceCatalogService);
  private readonly emailTemplateService = inject(EmailTemplateService);
  private readonly auditService = inject(TenantAuditService);

  protected readonly quotes = signal<QuoteRecord[]>([]);
  protected readonly owners = signal<PropertyOwner[]>([]);
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly services = signal<ServiceType[]>([]);
  protected readonly selected = signal<QuoteRecord | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly editorOpen = signal(false);
  protected readonly sendOpen = signal(false);
  protected readonly shareOpen = signal(false);
  protected readonly shareUrl = signal('');
  protected readonly downloading = signal(false);
  protected readonly conversionOpen = signal(false);
  protected readonly emailTemplateLoading = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal('');
  protected readonly historyQuote = signal<QuoteRecord | null>(null);
  protected readonly history = signal<AuditLogRecord[]>([]);
  protected conversionPropertyId = '';
  protected readonly editingId = signal('');
  protected search = '';
  protected status = 'ALL';
  protected form = this.emptyForm();
  protected sendForm = { recipientEmail: '', subject: '', message: '', accessPassword: '' };
  protected sharePassword = '';
  protected readonly statusOptions = [
    { label: 'All statuses', value: 'ALL' }, { label: 'Draft', value: 'DRAFT' }, { label: 'Awaiting response', value: 'SENT' },
    { label: 'Approved', value: 'APPROVED' }, { label: 'Declined', value: 'DECLINED' }, { label: 'Converted', value: 'CONVERTED' }
  ];
  protected readonly ownerOptions = computed(() => this.owners().filter((owner) => owner.active).map((owner) => ({ label: owner.displayName, value: owner.id })));
  protected readonly serviceOptions = computed(() => this.services().filter((service) => service.active).map((service) => ({ label: service.name, value: service.id })));
  protected readonly metrics = computed(() => {
    const quotes = this.quotes();
    const count = (statuses: QuoteStatus[]) => quotes.filter((quote) => statuses.includes(quote.status)).length;
    const approvedValue = quotes.filter((quote) => quote.status === 'APPROVED').reduce((sum, quote) => sum + quote.total, 0);
    return [
      { label: 'Drafts', value: count(['DRAFT']), detail: 'In preparation', status: 'DRAFT' },
      { label: 'Awaiting client', value: count(['SENT', 'VIEWED']), detail: 'Sent or viewed', status: 'SENT' },
      { label: 'Approved', value: count(['APPROVED']), detail: new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(approvedValue), status: 'APPROVED' },
      { label: 'Converted', value: count(['CONVERTED']), detail: 'Work orders created', status: 'CONVERTED' }
    ];
  });
  protected propertyOptions(): Array<{ label: string; value: string }> {
    return this.properties()
      .filter((property) => property.active && property.ownerId === this.form.customerId)
      .map((property) => ({ label: `${property.name} · ${property.addressLine1}`, value: property.id }));
  }

  protected conversionPropertyOptions(): Array<{ label: string; value: string }> {
    const customerId = this.selected()?.customerId;
    return this.properties().filter(property => property.active && (!customerId || property.ownerId === customerId))
      .map(property => ({ label: `${property.name} · ${property.addressLine1}`, value: property.id }));
  }

  protected clientChanged(): void {
    this.form.propertyId = '';
    this.form.adhocProperty = false;
    this.form.adhocPropertyName = '';
    this.form.adhocPropertyAddress = '';
  }

  protected toggleAdhocCustomer(): void {
    this.form.adhocCustomer = !this.form.adhocCustomer;
    this.form.customerId = '';
    this.form.propertyId = '';
    this.form.adhocCustomerName = '';
    this.form.adhocCustomerEmail = '';
    this.form.adhocCustomerPhone = '';
    this.form.adhocProperty = this.form.adhocCustomer;
    this.form.adhocPropertyName = '';
    this.form.adhocPropertyAddress = '';
  }

  protected toggleAdhocProperty(): void {
    if (this.form.adhocCustomer) return;
    this.form.adhocProperty = !this.form.adhocProperty;
    this.form.propertyId = '';
    this.form.adhocPropertyName = '';
    this.form.adhocPropertyAddress = '';
  }

  protected editorTotal(): number {
    const subtotal = this.form.lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.rate || 0), 0);
    return subtotal * (1 + Number(this.form.taxPercent || 0) / 100);
  }

  constructor() {
    void this.initialize();
  }

  protected async initialize(): Promise<void> {
    this.loading.set(true);
    try {
      const [quotes, owners, properties, catalog] = await Promise.all([
        firstValueFrom(this.quoteService.list()), firstValueFrom(this.ownerService.list()),
        firstValueFrom(this.propertyService.list()), firstValueFrom(this.catalogService.catalog())
      ]);
      this.quotes.set(quotes);
      this.owners.set(owners);
      this.properties.set(properties);
      this.services.set(catalog.serviceTypes);
      this.selected.set(quotes[0] || null);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const quotes = await firstValueFrom(this.quoteService.list(this.search, this.status));
      this.quotes.set(quotes);
      this.selected.set(quotes.find((quote) => quote.id === this.selected()?.id) || quotes[0] || null);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected setStatus(status: string): void {
    this.status = status;
    void this.load();
  }

  protected openCreate(): void {
    this.editingId.set('');
    this.form = this.emptyForm();
    this.editorOpen.set(true);
  }

  protected openEdit(quote: QuoteRecord): void {
    this.editingId.set(quote.id);
    this.form = {
      customerId: quote.customerId || '', adhocCustomer: !quote.customerId,
      adhocCustomerName: quote.customerId ? '' : quote.customerName,
      adhocCustomerEmail: quote.customerId ? '' : quote.customerEmail || '',
      adhocCustomerPhone: quote.customerId ? '' : quote.customerPhone || '',
      propertyId: quote.propertyId || '', adhocProperty: !quote.propertyId && Boolean(quote.propertyName || quote.propertyAddress),
      adhocPropertyName: quote.propertyId ? '' : quote.propertyName || '',
      adhocPropertyAddress: quote.propertyId ? '' : quote.propertyAddress || '',
      serviceTypeId: quote.serviceTypeId || '',
      title: quote.title, scope: quote.scope || '', validUntil: quote.validUntil || '',
      taxPercent: quote.taxRate * 100, notes: quote.notes || '', terms: quote.terms || '',
      lines: quote.lines.map((line) => ({ id: line.id, description: line.description, quantity: line.quantity, unit: line.unit || '', rate: line.rate }))
    };
    this.editorOpen.set(true);
  }

  protected addLine(): void {
    this.form.lines.push({ description: '', quantity: 1, unit: 'each', rate: 0 });
  }

  protected removeLine(index: number): void {
    if (this.form.lines.length > 1) this.form.lines.splice(index, 1);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const hasClient = this.form.adhocCustomer ? Boolean(this.form.adhocCustomerName.trim()) : Boolean(this.form.customerId);
    if (!hasClient || !this.form.title.trim() || this.form.lines.some((line) => !line.description.trim() || Number(line.quantity) <= 0 || Number(line.rate) < 0)) {
      this.error.set('Client, title, and complete pricing lines are required.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const request: UpsertQuoteRequest = {
        customerId: this.form.adhocCustomer ? undefined : this.form.customerId || undefined,
        adhocCustomerName: this.form.adhocCustomer ? this.form.adhocCustomerName.trim() : undefined,
        adhocCustomerEmail: this.form.adhocCustomer ? this.form.adhocCustomerEmail.trim() || undefined : undefined,
        adhocCustomerPhone: this.form.adhocCustomer ? this.form.adhocCustomerPhone.trim() || undefined : undefined,
        propertyId: this.form.adhocProperty ? undefined : this.form.propertyId || undefined,
        adhocPropertyName: this.form.adhocProperty ? this.form.adhocPropertyName.trim() || undefined : undefined,
        adhocPropertyAddress: this.form.adhocProperty ? this.form.adhocPropertyAddress.trim() || undefined : undefined,
        serviceTypeId: this.form.serviceTypeId || undefined, title: this.form.title.trim(),
        scope: this.form.scope || undefined, validUntil: this.form.validUntil || undefined,
        taxRate: Number(this.form.taxPercent || 0) / 100, notes: this.form.notes || undefined,
        terms: this.form.terms || undefined,
        lines: this.form.lines.map((line) => ({ ...line, quantity: Number(line.quantity), rate: Number(line.rate) }))
      };
      const saved = this.editingId()
        ? await firstValueFrom(this.quoteService.update(this.editingId(), request))
        : await firstValueFrom(this.quoteService.create(request));
      this.editorOpen.set(false);
      this.notice.set(`${saved.quoteNumber} saved as a draft.`);
      await this.load();
      this.selected.set(this.quotes().find((quote) => quote.id === saved.id) || saved);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async openSend(quote: QuoteRecord): Promise<void> {
    this.error.set('');
    this.selected.set(quote);
    this.sendForm = {
      recipientEmail: quote.customerEmail || '',
      subject: '',
      message: 'Please review this quote and approve or decline it using the secure link below.',
      accessPassword: this.newPassword()
    };
    this.sendOpen.set(true);
    this.emailTemplateLoading.set(true);
    try {
      const template = await firstValueFrom(this.emailTemplateService.quoteClient());
      if (this.selected()?.id === quote.id && this.sendOpen()) {
        const values: Record<string, string> = { quoteNumber: quote.quoteNumber, quoteTitle: quote.title,
          clientName: quote.customerName, propertyName: quote.propertyName || '', serviceName: quote.serviceName || '' };
        this.sendForm.subject = template.subject.replace(/\{\{(\w+)}}/g, (match, key: string) => values[key] ?? match);
      }
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.emailTemplateLoading.set(false); }
  }

  protected openHistory(quote: QuoteRecord): void {
    this.historyQuote.set(quote);
    this.history.set([]);
    this.historyOpen.set(true);
    void this.loadHistory();
  }

  protected async loadHistory(): Promise<void> {
    const quote = this.historyQuote();
    if (!quote || this.historyLoading()) return;
    this.historyLoading.set(true);
    this.historyError.set('');
    try { this.history.set(await firstValueFrom(this.auditService.list(500, 'QUOTE', quote.id))); }
    catch (error) { this.historyError.set(this.errorMessage(error)); }
    finally { this.historyLoading.set(false); }
  }

  protected historyLabel(action: string): string {
    const labels: Record<string, string> = { QUOTE_CREATED: 'Quote created', QUOTE_UPDATED: 'Quote edited',
      QUOTE_SHARED: 'Protected link created', QUOTE_EMAIL_SENT: 'Email sent', QUOTE_EMAIL_FAILED: 'Email failed',
      QUOTE_EMAIL_RECORDED: 'Email recorded (not sent)', QUOTE_EMAIL_RESENT: 'Email resend attempt',
      QUOTE_VIEWED: 'Client viewed quote', QUOTE_APPROVED: 'Client approved quote', QUOTE_DECLINED: 'Client declined quote',
      QUOTE_CONVERTED: 'Work order created', QUOTE_VOIDED: 'Quote voided', QUOTE_PDF_DOWNLOADED: 'Staff downloaded PDF',
      QUOTE_CLIENT_PDF_DOWNLOADED: 'Client downloaded PDF' };
    return labels[action] || action.replaceAll('_', ' ').toLowerCase();
  }

  protected historyActor(entry: AuditLogRecord): string {
    if (entry.metadata['source'] === 'CLIENT_LINK') return String(entry.metadata['clientName'] || 'Client access through protected link');
    return entry.actorName || entry.actorEmail || 'Tenant staff';
  }

  protected historyDetails(entry: AuditLogRecord): string {
    const labels: Record<string, string> = { recipientEmail: 'To', subject: 'Subject', status: 'Status',
      provider: 'Provider', providerMessage: 'Delivery response', clientNotes: 'Client notes', workOrderNumber: 'Work order' };
    return ['recipientEmail', 'subject', 'status', 'provider', 'providerMessage', 'clientNotes', 'workOrderNumber']
      .filter(key => entry.metadata[key] != null && entry.metadata[key] !== '')
      .map(key => `${labels[key]}: ${String(entry.metadata[key])}`).join('\n');
  }

  protected async send(): Promise<void> {
    const quote = this.selected();
    if (!quote || !this.sendForm.recipientEmail.trim() || this.saving()) return;
    if (!this.validPassword(this.sendForm.accessPassword)) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.quoteService.send(quote.id, this.sendForm));
      this.sendOpen.set(false);
      this.sharePassword = this.sendForm.accessPassword;
      this.shareUrl.set(result.publicUrl);
      this.shareOpen.set(true);
      this.notice.set(result.status === 'SENT' ? `Quote sent to ${result.recipient}.` : 'The email provider did not confirm delivery.');
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected openShare(quote: QuoteRecord): void {
    this.selected.set(quote);
    this.error.set('');
    this.sharePassword = this.newPassword();
    this.shareUrl.set('');
    this.shareOpen.set(true);
  }

  protected async share(): Promise<void> {
    const quote = this.selected();
    if (!quote || this.saving() || !this.validPassword(this.sharePassword)) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.quoteService.share(quote.id, this.sharePassword));
      this.shareUrl.set(result.publicUrl);
      this.notice.set('Protected quote link created.');
      await this.load();
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.saving.set(false); }
  }

  protected async copyShare(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${this.shareUrl()}\nPassword: ${this.sharePassword}`);
      this.notice.set('Quote link and password copied.');
    } catch { this.error.set('Clipboard unavailable. Select the link and password to copy them.'); }
  }

  protected async downloadPdf(quote: QuoteRecord): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const blob = await firstValueFrom(this.quoteService.downloadPdf(quote.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quote.quoteNumber}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.downloading.set(false); }
  }

  private newPassword(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private validPassword(value: string): boolean {
    if (value.length < 8 || value.length > 64 || new TextEncoder().encode(value).length > 72) {
      this.error.set('Use a password of 8 to 64 characters.');
      return false;
    }
    return true;
  }

  protected async convert(quote: QuoteRecord): Promise<void> {
    if (!quote.propertyId) {
      this.selected.set(quote);
      this.conversionPropertyId = '';
      this.error.set('');
      this.conversionOpen.set(true);
      return;
    }
    if (!confirm(`Create a work order from ${quote.quoteNumber}?`)) return;
    await this.createWorkOrder(quote);
  }

  protected async convertSelected(): Promise<void> {
    const quote = this.selected();
    if (quote && this.conversionPropertyId) await this.createWorkOrder(quote, this.conversionPropertyId);
  }

  private async createWorkOrder(quote: QuoteRecord, propertyId?: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const updated = await firstValueFrom(this.quoteService.convert(quote.id, propertyId));
      this.conversionOpen.set(false);
      this.notice.set(`Work order ${updated.convertedWorkOrderNumber} created.`);
      await this.load();
      this.selected.set(this.quotes().find((item) => item.id === quote.id) || updated);
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async voidQuote(quote: QuoteRecord): Promise<void> {
    if (!confirm(`Void ${quote.quoteNumber}? The client response link will stop working.`)) return;
    try {
      await firstValueFrom(this.quoteService.void(quote.id));
      this.notice.set(`${quote.quoteNumber} was voided.`);
      await this.load();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    }
  }

  protected canEdit(quote: QuoteRecord): boolean { return ['DRAFT', 'DECLINED'].includes(quote.status); }
  protected canSend(quote: QuoteRecord): boolean { return ['DRAFT', 'DECLINED', 'SENT', 'VIEWED'].includes(quote.status); }
  protected statusLabel(status: QuoteStatus): string { return status.replaceAll('_', ' ').toLowerCase().replace(/^./, (value) => value.toUpperCase()); }
  protected severity(status: QuoteStatus): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (status === 'APPROVED' || status === 'CONVERTED') return 'success';
    if (status === 'SENT' || status === 'VIEWED') return 'info';
    if (status === 'DECLINED' || status === 'VOID' || status === 'EXPIRED') return 'danger';
    return 'secondary';
  }

  private emptyForm(): QuoteEditorForm {
    return { customerId: '', adhocCustomer: false, adhocCustomerName: '', adhocCustomerEmail: '', adhocCustomerPhone: '',
      propertyId: '', adhocProperty: false, adhocPropertyName: '', adhocPropertyAddress: '',
      serviceTypeId: '', title: '', scope: '', validUntil: '',
      taxPercent: 13, notes: '', terms: 'Pricing is valid until the date shown above.', lines: [{ description: '', quantity: 1, unit: 'each', rate: 0 }] };
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) return error.error?.error?.message || error.error?.message || 'The quote request could not be completed.';
    return 'The quote request could not be completed.';
  }
}

interface QuoteEditorLine {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
}

interface QuoteEditorForm {
  customerId: string;
  adhocCustomer: boolean;
  adhocCustomerName: string;
  adhocCustomerEmail: string;
  adhocCustomerPhone: string;
  propertyId: string;
  adhocProperty: boolean;
  adhocPropertyName: string;
  adhocPropertyAddress: string;
  serviceTypeId: string;
  title: string;
  scope: string;
  validUntil: string;
  taxPercent: number;
  notes: string;
  terms: string;
  lines: QuoteEditorLine[];
}
