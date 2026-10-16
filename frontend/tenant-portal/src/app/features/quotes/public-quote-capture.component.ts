import {
  Component,
  ChangeDetectionStrategy,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { TenantDatePipe as DatePipe } from '../../shared/tenant-date.pipe';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { QuoteCaptureView } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TenantThemeService } from '../../core/services/tenant-theme.service';
import { VoiceNoteButtonComponent } from '../../shared/voice-note-button.component';
import { QuoteService } from './services/quote.service';
import { QuotePhotoGalleryComponent } from './quote-photo-gallery.component';
import {
  QuotePhotoUploadComponent,
  QuotePhotoUpload,
  prepareQuotePhoto,
} from './quote-photo-upload.component';
import { quoteCaptureError } from './quote-site-visit-utils';

@Component({
  selector: 'lorne-public-quote-capture',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputTextModule,
    VoiceNoteButtonComponent,
    QuotePhotoGalleryComponent,
    QuotePhotoUploadComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="min-h-dvh bg-slate-50 px-4 py-6 sm:py-10">
      <div class="mx-auto max-w-3xl">
        @if (!data()) {
          <form
            class="mx-auto max-w-md space-y-5 rounded-md border border-slate-200 bg-white p-6 shadow-sm"
            (ngSubmit)="open()"
          >
            <div>
              <p class="text-sm font-semibold text-teal-700">Site visit</p>
              <h1 class="mt-1 text-2xl font-bold text-slate-950">
                Open site capture
              </h1>
            </div>
            <label class="block text-sm font-semibold"
              >Access password<input
                pInputText
                type="password"
                class="mt-2 w-full"
                name="password"
                [(ngModel)]="password"
                autocomplete="current-password"
                required
            /></label>
            @if (error()) {
              <p role="alert" class="text-sm text-red-700">{{ error() }}</p>
            }
            <button
              pButton
              type="submit"
              icon="pi pi-lock-open"
              label="Open site visit"
              class="w-full"
              [loading]="busy()"
              [disabled]="!password || busy()"
            ></button>
          </form>
        } @else if (data(); as visit) {
          <header class="border-b border-slate-200 pb-5">
            <div class="flex items-center gap-3">
              @if (visit.logoUrl) {
                <img
                  [src]="visit.logoUrl"
                  [alt]="visit.companyName"
                  class="h-14 w-20 shrink-0 object-contain"
                />
              }
              <div class="min-w-0">
                <p class="break-words font-semibold text-teal-700">
                  {{ visit.companyName }}
                </p>
                <span class="text-xs text-slate-500"
                  >{{ visit.quoteNumber }} · Site visit</span
                >
              </div>
            </div>
            <h1 class="mt-4 break-words text-2xl font-bold text-slate-950">
              {{ visit.title }}
            </h1>
            @if (visit.propertyName) {
              <p class="mt-2 font-semibold text-slate-700">
                {{ visit.propertyName }}
              </p>
            }
            @if (visit.propertyAddress) {
              <p class="mt-1 text-sm text-slate-600">
                {{ visit.propertyAddress }}
              </p>
            }
            @if (visit.scope) {
              <p
                class="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
              >
                {{ visit.scope }}
              </p>
            }
            <p class="mt-3 text-xs text-slate-500">
              Capture closes {{ visit.expiresAt | date: 'medium' }}, or when the
              quote is published.
            </p>
          </header>
          <div class="space-y-5 py-5">
            @if (error()) {
              <p
                role="alert"
                class="rounded-md bg-red-50 p-3 text-sm text-red-700"
              >
                {{ error() }}
              </p>
            }
            @if (notice()) {
              <p
                role="status"
                class="rounded-md bg-teal-50 p-3 text-sm text-teal-800"
              >
                {{ notice() }}
              </p>
            }
            <label class="block text-sm font-semibold text-slate-700"
              >Your name<input
                pInputText
                class="mt-2 w-full"
                [(ngModel)]="author"
                maxlength="120"
                [disabled]="busy()"
            /></label>
            <section class="border-y border-slate-200 py-5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-lg font-bold text-slate-900">
                  Private site note
                </h2>
                <lorne-voice-note-button
                  [text]="note"
                  [disabled]="busy()"
                  [showUnsupported]="true"
                  (textChange)="note = $event"
                  (error)="error.set($event)"
                />
              </div>
              <textarea
                class="mt-3 w-full rounded-md border border-slate-300 bg-white p-3 text-base"
                [(ngModel)]="note"
                rows="6"
                maxlength="10000"
                aria-label="Private site note"
                [disabled]="busy()"
              ></textarea>
              <button
                pButton
                class="mt-3 w-full sm:w-auto"
                icon="pi pi-save"
                label="Save site note"
                [disabled]="busy() || !note.trim() || !author.trim()"
                (click)="saveNote()"
              ></button>
            </section>
            <section class="space-y-3">
              <h2 class="text-lg font-bold text-slate-900">Photos</h2>
              <lorne-quote-photo-upload
                [busy]="busy()"
                [progress]="progress()"
                (upload)="upload($event)"
              />
              @if (pending()) {
                <button
                  pButton
                  icon="pi pi-refresh"
                  label="Retry remaining photos"
                  [disabled]="busy()"
                  (click)="retryUpload()"
                ></button>
                <button
                  pButton
                  text
                  severity="secondary"
                  icon="pi pi-times"
                  label="Discard pending photos"
                  [disabled]="busy()"
                  (click)="pending.set(null)"
                ></button>
              }
              <lorne-quote-photo-gallery
                [photos]="visit.photos"
                [imageLoader]="imageLoader"
                [showVisibility]="true"
              />
            </section>
            <section class="border-t border-slate-200 pt-5">
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-lg font-bold text-slate-900">
                  Saved site notes
                </h2>
                <button
                  pButton
                  text
                  icon="pi pi-refresh"
                  aria-label="Refresh saved notes"
                  [disabled]="busy()"
                  (click)="refresh()"
                ></button>
              </div>
              @for (entry of visit.notes; track entry.id) {
                <article class="border-b border-slate-200 py-4">
                  <p class="text-xs text-slate-500">
                    {{ entry.authorName }} ·
                    {{ entry.createdAt | date: 'medium' }}
                  </p>
                  <p
                    class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
                  >
                    {{ entry.body }}
                  </p>
                </article>
              }
              @if (!visit.notes.length) {
                <p class="mt-3 text-sm text-slate-500">No saved notes yet.</p>
              }
            </section>
          </div>
        }
      </div>
    </main>
  `,
  styles: [
    `
      :host ::ng-deep .p-button {
        min-height: 44px;
      }
      :host input,
      :host textarea {
        font-size: 16px;
      }
    `,
  ],
})
export class PublicQuoteCaptureComponent {
  private readonly service = inject(QuoteService);
  private readonly theme = inject(TenantThemeService);
  private readonly token =
    inject(ActivatedRoute).snapshot.paramMap.get('token') || '';
  protected readonly data = signal<QuoteCaptureView | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly progress = signal('');
  protected readonly pending = signal<QuotePhotoUpload | null>(null);
  protected password = '';
  protected author = '';
  protected note = '';
  protected readonly imageLoader = (id: string) =>
    this.service.publicPhotoImage(this.token, this.password, id, true);
  @HostListener('window:beforeunload', ['$event']) beforeUnload(
    event: BeforeUnloadEvent,
  ) {
    if (this.note.trim() || this.busy() || this.pending()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
  protected async open() {
    await this.run(async () => this.refresh());
  }
  protected async refresh() {
    try {
      const data = await firstValueFrom(
        this.service.captureView(this.token, this.password),
      );
      this.data.set(data);
      this.theme.apply({
        timezone: data.timezone,
        organizationName: data.companyName,
        themePrimaryColor: data.primaryColor,
      });
    } catch (error) {
      this.error.set(quoteCaptureError(error));
    }
  }
  protected async saveNote() {
    await this.run(async () => {
      const entry = await firstValueFrom(
        this.service.captureNote(
          this.token,
          this.password,
          this.author,
          this.note,
        ),
      );
      this.data.update((old) =>
        old ? { ...old, notes: [entry, ...old.notes] } : old,
      );
      this.note = '';
      this.notice.set('Site note saved.');
    });
  }
  protected async upload(request: QuotePhotoUpload) {
    if (this.busy()) return;
    if (!this.author.trim()) {
      this.error.set('Enter your name before uploading.');
      return;
    }
    const files = [...request.files],
      uploadIds = request.uploadIds
        ? [...request.uploadIds]
        : files.map(() => crypto.randomUUID());
    this.pending.set({ ...request, files, uploadIds });
    await this.run(async () => {
      let done = 0;
      while (files.length) {
        this.progress.set(`Uploading ${++done} of ${request.files.length}...`);
        const file = await prepareQuotePhoto(files[0]);
        const photo = await firstValueFrom(
          this.service.uploadCapturePhoto(
            this.token,
            this.password,
            file,
            request.caption,
            request.clientVisible,
            this.author,
            uploadIds[0],
          ),
        );
        this.data.update((old) =>
          old
            ? {
                ...old,
                photos: old.photos.some((existing) => existing.id === photo.id)
                  ? old.photos
                  : [...old.photos, photo],
              }
            : old,
        );
        files.shift();
        uploadIds.shift();
      }
      this.pending.set(null);
      this.notice.set('Photos saved.');
    });
    this.progress.set('');
  }
  protected retryUpload() {
    const request = this.pending();
    if (request) void this.upload({ ...request, files: [...request.files] });
  }
  private async run(action: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
    } catch (error) {
      this.error.set(quoteCaptureError(error));
    } finally {
      this.busy.set(false);
    }
  }
}
