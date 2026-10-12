import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { PublicQuote } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { QuoteService } from './services/quote.service';
import { VoiceNoteButtonComponent } from '../../shared/voice-note-button.component';

@Component({
  selector: 'lorne-public-quote-response',
  standalone: true,
  imports: [ButtonModule, CurrencyPipe, DatePipe, DecimalPipe, FormsModule, InputTextModule, VoiceNoteButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-screen bg-slate-100 px-3 py-6 sm:px-6 sm:py-10" [style.--quote-brand]="data()?.primaryColor || '#0f766e'">
      <div class="mx-auto max-w-4xl">
        @if (!data()) {
          <form class="mx-auto max-w-md rounded-md border border-slate-200 bg-white p-6 shadow-sm" (ngSubmit)="load()">
            <i class="pi pi-lock text-2xl text-teal-700" aria-hidden="true"></i>
            <h1 class="mt-3 text-xl font-bold text-slate-950">Open your quote</h1>
            <label class="field mt-5"><span>Access password</span><input pInputText class="w-full" type="password" name="password" autocomplete="current-password" [(ngModel)]="password" required maxlength="64" /></label>
            @if (error()) { <p class="mt-3 text-sm text-red-700" role="alert">{{ error() }}</p> }
            <button class="mt-4 w-full" pButton type="submit" icon="pi pi-unlock" label="Open quote" [loading]="loading()" [disabled]="!password || loading()"></button>
          </form>
        } @else if (loading()) {
          <div class="rounded-md border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">Loading quote...</div>
        } @else if (data(); as view) {
          @if (error()) { <p class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">{{ error() }}</p> }
          <article class="overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
            <header class="flex flex-col gap-5 border-t-[6px] p-6 sm:flex-row sm:items-start sm:justify-between sm:p-8">
              <div class="flex items-center gap-4">
                @if (view.logoUrl) {
                  <div class="grid h-16 w-20 place-items-center border border-slate-200 bg-white p-2"><img class="max-h-full max-w-full object-contain" [src]="view.logoUrl" referrerpolicy="no-referrer" [alt]="view.companyName + ' logo'" /></div>
                }
                <div><p class="text-sm font-bold text-[var(--quote-brand)]">{{ view.companyName }}</p><h1 class="mt-1 text-3xl font-bold text-slate-950">Quote</h1></div>
              </div>
              <div class="text-left sm:text-right">
                <strong class="text-lg text-slate-950">{{ view.quote.quoteNumber }}</strong>
                <p class="mt-1 text-sm text-slate-500">Issued {{ view.quote.issueDate | date:'longDate' }}</p>
                @if (view.quote.validUntil) { <p class="text-sm text-slate-500">Valid until {{ view.quote.validUntil | date:'longDate' }}</p> }
              </div>
            </header>

            <section class="grid gap-5 border-y border-slate-200 bg-slate-50 p-6 sm:grid-cols-2 sm:p-8">
              <div><span class="label">Prepared for</span><strong class="mt-1 block text-lg">{{ view.quote.customerName }}</strong><p class="text-sm text-slate-600">{{ view.quote.propertyName }}<br />{{ view.quote.propertyAddress }}</p></div>
              <div><span class="label">Quote for</span><strong class="mt-1 block text-lg">{{ view.quote.title }}</strong><p class="text-sm text-slate-600">{{ view.quote.serviceName }}</p></div>
            </section>

            <section class="p-6 sm:p-8">
              @if (view.quote.scope) {
                <div class="mb-7"><span class="label">Scope of work</span><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{{ view.quote.scope }}</p></div>
              }
              <div class="hidden overflow-x-auto border border-slate-200 sm:block">
                <table class="w-full min-w-[34rem] border-collapse text-sm">
                  <thead class="bg-slate-950 text-left text-white"><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                  <tbody class="divide-y divide-slate-100">
                    @for (line of view.quote.lines; track line.id || line.sortOrder) {
                      <tr><td class="font-semibold">{{ line.description }}</td><td>{{ line.quantity }} {{ line.unit }}</td><td>{{ line.rate | currency }}</td><td class="font-bold">{{ line.amount | currency }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <div class="divide-y divide-slate-200 border-y border-slate-200 sm:hidden">
                @for (line of view.quote.lines; track line.id || line.sortOrder) {
                  <div class="py-4">
                    <p class="text-sm font-semibold leading-5 text-slate-900">{{ line.description }}</p>
                    <div class="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div><span class="label">Qty</span><span>{{ line.quantity }} {{ line.unit }}</span></div>
                      <div><span class="label">Rate</span><span>{{ line.rate | currency }}</span></div>
                      <div class="text-right"><span class="label">Amount</span><strong>{{ line.amount | currency }}</strong></div>
                    </div>
                  </div>
                }
              </div>
              <div class="ml-auto mt-5 max-w-sm space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-slate-500">Subtotal</span><strong>{{ view.quote.subtotal | currency }}</strong></div>
                <div class="flex justify-between"><span class="text-slate-500">Tax ({{ view.quote.taxRate * 100 | number:'1.0-2' }}%)</span><strong>{{ view.quote.taxAmount | currency }}</strong></div>
                <div class="flex justify-between border-t border-slate-300 pt-3 text-xl"><span>Total</span><strong>{{ view.quote.total | currency }}</strong></div>
              </div>
              @if (view.quote.notes) { <div class="mt-7"><span class="label">Notes</span><p class="mt-2 whitespace-pre-wrap text-sm text-slate-700">{{ view.quote.notes }}</p></div> }
              @if (view.quote.terms) { <div class="mt-5"><span class="label">Terms</span><p class="mt-2 whitespace-pre-wrap text-sm text-slate-600">{{ view.quote.terms }}</p></div> }
            </section>

            <section class="border-t border-slate-200 bg-slate-50 p-6 sm:p-8">
              @if (view.quote.status === 'APPROVED' || view.quote.status === 'CONVERTED') {
                <div class="rounded-md border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                  <strong class="text-lg">Quote approved</strong><p class="mt-1 text-sm">Approved by {{ view.quote.approvalName }}.</p>
                  @if (view.quote.approvalComment) { <p class="mt-3 whitespace-pre-wrap text-sm">{{ view.quote.approvalComment }}</p> }
                </div>
              } @else if (view.quote.status === 'DECLINED') {
                <div class="rounded-md border border-red-200 bg-red-50 p-5 text-red-900">
                  <strong class="text-lg">Quote declined</strong><p class="mt-1 text-sm">Response from {{ view.quote.approvalName }}.</p>
                  @if (view.quote.approvalComment) { <p class="mt-3 whitespace-pre-wrap text-sm">{{ view.quote.approvalComment }}</p> }
                </div>
              } @else if (['VOID','EXPIRED'].includes(view.quote.status)) {
                <div class="rounded-md border border-amber-200 bg-amber-50 p-5 text-amber-900"><strong class="text-lg">No longer open</strong><p class="mt-1 text-sm">Contact {{ view.companyName }} if you need an updated quote.</p></div>
              } @else {
                <h2 class="text-xl font-bold text-slate-950">Your response</h2>
                <div class="mt-4 grid gap-3 sm:grid-cols-2">
                  <label class="field"><span>Your name *</span><input pInputText [(ngModel)]="name" /></label>
                  <div class="field sm:col-span-2">
                    <label for="quote-response-note"><span>Notes</span></label>
                    <textarea id="quote-response-note" rows="3" [(ngModel)]="comment"></textarea>
                    <lorne-voice-note-button [text]="comment" label="Speak note" [showUnsupported]="true" [disabled]="submitting()" (textChange)="comment = $event" (error)="error.set($event)" />
                  </div>
                </div>
                <div class="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button pButton type="button" icon="pi pi-check" label="Approve quote" [loading]="submitting()" (click)="decide('approve')"></button>
                  <button pButton type="button" severity="danger" outlined icon="pi pi-times" label="Decline" [disabled]="submitting()" (click)="decide('decline')"></button>
                </div>
              }
            </section>
          </article>
          <footer class="mt-4 flex flex-col justify-between gap-2 px-1 text-xs text-slate-500 sm:flex-row">
            <span>{{ view.supportEmail }} @if (view.phone) { · {{ view.phone }} }</span>
            <button pButton type="button" size="small" severity="secondary" icon="pi pi-download" label="Download PDF" [loading]="downloading()" (click)="downloadPdf()"></button>
          </footer>
        }
      </div>
    </main>
  `,
  styles: `
    article { border-top-color: var(--quote-brand); }
    th, td { padding: .8rem 1rem; }
    th:nth-child(n+2), td:nth-child(n+2) { text-align: right; }
    .label, .field span { display: block; color: #64748b; font-size: .7rem; font-weight: 800; text-transform: uppercase; }
    .field { display: grid; gap: .4rem; }
    .field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: .7rem; resize: vertical; background: white; }
    @media print { main { padding: 0; background: white; } footer, section:last-of-type { display: none; } article { box-shadow: none; } }
  `
})
export class PublicQuoteResponseComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly quoteService = inject(QuoteService);
  protected readonly data = signal<PublicQuote | null>(null);
  protected readonly loading = signal(false);
  protected readonly downloading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected name = '';
  protected comment = '';
  protected password = '';
  private readonly token = this.route.snapshot.paramMap.get('token') || '';

  protected async load(): Promise<void> {
    if (!this.password || this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.data.set(await firstValueFrom(this.quoteService.publicQuote(this.token, this.password)));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async decide(decision: 'approve' | 'decline'): Promise<void> {
    if (this.submitting()) return;
    if (!this.name.trim()) {
      this.error.set('Enter your name before responding.');
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    try {
      this.data.set(await firstValueFrom(this.quoteService.decide(this.token, this.password, decision, { name: this.name.trim(), comment: this.comment.trim() || undefined })));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async downloadPdf(): Promise<void> {
    if (this.downloading()) return;
    this.downloading.set(true);
    try {
      const blob = await firstValueFrom(this.quoteService.publicPdf(this.token, this.password));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.data()?.quote.quoteNumber || 'quote'}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { this.error.set(this.errorMessage(error)); }
    finally { this.downloading.set(false); }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 429) return 'Too many attempts. Try again in five minutes.';
      if (error.status === 401 || error.status === 404) return 'The quote link or password is invalid.';
      return error.error?.error?.message || error.error?.message || 'This quote cannot be opened.';
    }
    return 'This quote cannot be opened.';
  }
}
