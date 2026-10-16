import {
  Component,
  ChangeDetectionStrategy,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TenantDatePipe as DatePipe } from '../../shared/tenant-date.pipe';
import { FormsModule } from '@angular/forms';
import type {
  QuotePhoto,
  QuoteRecord,
  QuoteSiteDetails,
} from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AuthService } from '../../core/services/auth.service';
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
  selector: 'lorne-quote-site-visit-panel',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    VoiceNoteButtonComponent,
    QuotePhotoGalleryComponent,
    QuotePhotoUploadComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-4 border-t border-slate-200 pt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-bold text-slate-900">Site visit & photos</h3>
        @if (editable()) {
          <button
            pButton
            size="small"
            severity="secondary"
            icon="pi pi-mobile"
            label="Site visit link"
            (click)="openLink()"
            [disabled]="busy()"
          ></button>
        }
        <button
          pButton
          size="small"
          text
          icon="pi pi-refresh"
          aria-label="Refresh site details"
          (click)="load()"
          [disabled]="busy()"
        ></button>
      </div>
      @if (error()) {
        <p role="alert" class="break-words text-sm text-red-700">
          {{ error() }}
        </p>
      }
      @if (notice()) {
        <p role="status" class="text-sm text-teal-700">{{ notice() }}</p>
      }
      @if (loading()) {
        <p class="text-sm text-slate-500">Loading site visit...</p>
      }
      @if (details(); as site) {
        @if (editable()) {
          <label class="block text-sm font-semibold text-slate-700"
            >Captured by<input
              pInputText
              class="mt-1 w-full"
              [(ngModel)]="author"
              maxlength="120"
              [disabled]="busy()"
          /></label>
          <lorne-quote-photo-upload
            [busy]="busy()"
            [progress]="progress()"
            (upload)="upload($event)"
          />
          @if (pendingUpload()) {
            <button
              pButton
              size="small"
              icon="pi pi-refresh"
              label="Retry remaining photos"
              [disabled]="busy()"
              (click)="retryUpload()"
            ></button>
            <button
              pButton
              size="small"
              text
              severity="secondary"
              icon="pi pi-times"
              label="Discard pending photos"
              [disabled]="busy()"
              (click)="pendingUpload.set(null)"
            ></button>
          }
        }
        @if (site.photos.length) {
          <lorne-quote-photo-gallery
            [photos]="site.photos"
            [imageLoader]="imageLoader"
            [editable]="editable() && !busy()"
            [showVisibility]="true"
            (editPhoto)="openPhoto($event)"
            (deletePhoto)="removePhoto($event)"
          />
        } @else {
          <p class="text-sm text-slate-500">No photos yet.</p>
        }
        <div class="flex items-center justify-between gap-2">
          <h4 class="font-semibold text-slate-800">Private site notes</h4>
          @if (editable()) {
            <lorne-voice-note-button
              [text]="note"
              [disabled]="busy()"
              (textChange)="note = $event"
              (error)="error.set($event)"
            />
          }
        </div>
        @if (editable()) {
          <textarea
            class="w-full rounded-md border border-slate-300 p-3 text-sm"
            rows="4"
            aria-label="Private site note"
            [(ngModel)]="note"
            maxlength="10000"
            [disabled]="busy()"
          ></textarea>
          <button
            pButton
            size="small"
            icon="pi pi-save"
            label="Save site note"
            [disabled]="busy() || !note.trim()"
            (click)="saveNote()"
          ></button>
        }
        @for (entry of site.notes; track entry.id) {
          <article class="border-t border-slate-200 py-3">
            <div
              class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"
            >
              <span
                >{{ entry.authorName }} ·
                {{ entry.createdAt | date: 'medium' }}</span
              >
              @if (editable()) {
                <button
                  pButton
                  text
                  size="small"
                  icon="pi pi-file-edit"
                  label="Add to scope"
                  (click)="useNote.emit(entry.body)"
                ></button>
              }
            </div>
            <p
              class="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700"
            >
              {{ entry.body }}
            </p>
          </article>
        }
      }
    </section>
    <p-dialog
      header="Mobile site visit"
      closeAriaLabel="Close site visit link"
      [visible]="linkOpen()"
      [modal]="true"
      [style]="{ width: 'min(32rem,94vw)' }"
      (visibleChange)="!$event && linkOpen.set(false)"
    >
      @if (details()?.captureLink?.active) {
        <label class="block text-sm font-semibold"
          >Site visit link<input
            pInputText
            class="mt-2 w-full"
            [value]="details()?.captureLink?.publicUrl || ''"
            readonly
        /></label>
        <p class="mt-2 text-sm text-slate-600">
          Expires {{ details()?.captureLink?.expiresAt | date: 'medium' }}.
          Closed when the quote is published.
        </p>
        @if (linkPassword) {
          <label class="mt-3 block text-sm font-semibold"
            >Password<input
              pInputText
              class="mt-2 w-full"
              [value]="linkPassword"
              readonly
          /></label>
        } @else {
          <p class="mt-3 text-sm text-slate-600">
            Use the original password. Revoke this link to create new
            credentials.
          </p>
        }
        <div class="mt-4 flex flex-wrap gap-2">
          <button
            pButton
            icon="pi pi-copy"
            label="Copy link"
            (click)="copyLink()"
          ></button>
          <button
            pButton
            severity="danger"
            text
            icon="pi pi-ban"
            label="Revoke link"
            [disabled]="busy()"
            (click)="revoke()"
          ></button>
        </div>
      } @else {
        <label class="block text-sm font-semibold"
          >Access password<input
            pInputText
            class="mt-2 w-full"
            [(ngModel)]="linkPassword"
            minlength="8"
            maxlength="64"
            autocomplete="new-password"
        /></label>
        <p class="mt-3 text-sm text-slate-600">
          Private notes and photos only. Pricing and approval are not available
          on this link. Share the password separately.
        </p>
        <button
          pButton
          class="mt-4"
          icon="pi pi-link"
          label="Create site visit link"
          [disabled]="busy() || linkPassword.length < 8"
          (click)="createLink()"
        ></button>
      }
      @if (error()) {
        <p role="alert" class="mt-3 text-sm text-red-700">{{ error() }}</p>
      }
      @if (notice()) {
        <p role="status" class="mt-3 text-sm text-teal-700">{{ notice() }}</p>
      }
    </p-dialog>
    <p-dialog
      header="Photo details"
      closeAriaLabel="Close photo details"
      [visible]="!!editingPhoto()"
      [modal]="true"
      [style]="{ width: 'min(30rem,94vw)' }"
      (visibleChange)="!$event && editingPhoto.set(null)"
    >
      <label class="block text-sm font-semibold"
        >Caption<input
          pInputText
          class="mt-2 w-full"
          [(ngModel)]="photoCaption"
          maxlength="500"
      /></label>
      <label class="my-4 flex items-center gap-2 text-sm"
        ><input type="checkbox" [(ngModel)]="photoVisible" /> Visible to
        client</label
      >
      <button
        pButton
        icon="pi pi-save"
        label="Save photo details"
        [disabled]="busy()"
        (click)="savePhoto()"
      ></button>
      @if (error()) {
        <p class="mt-3 text-sm text-red-700">{{ error() }}</p>
      }
    </p-dialog>
  `,
})
export class QuoteSiteVisitPanelComponent {
  readonly quote = input.required<QuoteRecord>();
  readonly useNote = output<string>();
  private readonly service = inject(QuoteService);
  protected readonly details = signal<QuoteSiteDetails | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected readonly loading = signal(false);
  protected readonly progress = signal('');
  protected readonly linkOpen = signal(false);
  protected readonly editingPhoto = signal<QuotePhoto | null>(null);
  protected readonly pendingUpload = signal<QuotePhotoUpload | null>(null);
  protected author = inject(AuthService).currentUser()?.displayName || '';
  protected note = '';
  protected linkPassword = '';
  protected photoCaption = '';
  protected photoVisible = true;
  private loadedId = '';
  private passwordLinkUrl = '';
  private loadVersion = 0;
  protected readonly imageLoader = (id: string) =>
    this.service.photoImage(this.quote().id, id);
  protected editable() {
    return ['DRAFT', 'DECLINED'].includes(this.quote().status);
  }
  constructor() {
    effect(() => {
      const quote = this.quote();
      if (this.loadedId !== quote.id) {
        this.loadedId = quote.id;
        this.details.set(null);
        this.note = '';
        this.linkPassword = '';
        this.passwordLinkUrl = '';
        this.pendingUpload.set(null);
        this.linkOpen.set(false);
      }
      void this.load();
    });
  }
  protected async load() {
    const id = this.quote().id,
      version = ++this.loadVersion;
    this.loading.set(true);
    try {
      const details = await firstValueFrom(this.service.siteDetails(id));
      if (version === this.loadVersion) {
        if (
          details.captureLink?.active &&
          details.captureLink.publicUrl !== this.passwordLinkUrl
        )
          this.linkPassword = '';
        this.details.set(details);
      }
    } catch (error) {
      if (version === this.loadVersion)
        this.error.set(quoteCaptureError(error));
    } finally {
      if (version === this.loadVersion) this.loading.set(false);
    }
  }
  protected async saveNote() {
    await this.run(async () => {
      await firstValueFrom(
        this.service.siteNote(this.quote().id, this.author, this.note),
      );
      this.note = '';
      await this.load();
      this.notice.set('Site note saved.');
    });
  }
  protected openLink() {
    this.error.set('');
    this.notice.set('');
    if (!this.details()?.captureLink?.active) this.linkPassword = newPassword();
    this.linkOpen.set(true);
  }
  protected async createLink() {
    await this.run(async () => {
      const link = await firstValueFrom(
        this.service.captureLink(this.quote().id, this.linkPassword),
      );
      this.passwordLinkUrl = link.publicUrl;
      await this.load();
    });
  }
  protected async revoke() {
    if (!window.confirm('Revoke this site visit link?')) return;
    await this.run(async () => {
      await firstValueFrom(this.service.revokeCapture(this.quote().id));
      this.linkPassword = newPassword();
      this.passwordLinkUrl = '';
      await this.load();
    });
  }
  protected async copyLink() {
    try {
      await navigator.clipboard.writeText(
        this.details()?.captureLink?.publicUrl || '',
      );
      this.notice.set('Link copied. Share the password separately.');
    } catch {
      this.error.set('Copy the link from the field above.');
    }
  }
  protected openPhoto(photo: QuotePhoto) {
    this.editingPhoto.set(photo);
    this.photoCaption = photo.caption;
    this.photoVisible = photo.clientVisible;
    this.error.set('');
  }
  protected async savePhoto() {
    const photo = this.editingPhoto();
    if (!photo) return;
    await this.run(async () => {
      await firstValueFrom(
        this.service.updatePhoto(this.quote().id, {
          ...photo,
          caption: this.photoCaption,
          clientVisible: this.photoVisible,
        }),
      );
      this.editingPhoto.set(null);
      await this.load();
    });
  }
  protected async removePhoto(photo: QuotePhoto) {
    if (!window.confirm('Remove this photo from the quote?')) return;
    await this.run(async () => {
      await firstValueFrom(this.service.deletePhoto(this.quote().id, photo.id));
      await this.load();
    });
  }
  protected async upload(request: QuotePhotoUpload) {
    if (this.busy()) return;
    if (!this.author.trim()) {
      this.error.set('Enter your name before uploading.');
      return;
    }
    const quoteId = this.quote().id,
      files = [...request.files],
      uploadIds = request.uploadIds
        ? [...request.uploadIds]
        : files.map(() => crypto.randomUUID());
    this.pendingUpload.set({ ...request, files, uploadIds });
    await this.run(async () => {
      let done = 0;
      while (files.length) {
        this.progress.set(`Uploading ${++done} of ${request.files.length}...`);
        const file = await prepareQuotePhoto(files[0]);
        await firstValueFrom(
          this.service.uploadQuotePhoto(
            quoteId,
            file,
            request.caption,
            request.clientVisible,
            this.author,
            uploadIds[0],
          ),
        );
        files.shift();
        uploadIds.shift();
      }
      this.pendingUpload.set(null);
      this.notice.set('Photos saved.');
    });
    await this.load();
    this.progress.set('');
  }
  protected retryUpload() {
    const pending = this.pendingUpload();
    if (pending) void this.upload({ ...pending, files: [...pending.files] });
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
function newPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
