import {
  Component,
  ChangeDetectionStrategy,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import type { QuotePhoto } from '@lorne/contracts';
import type { Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'lorne-quote-photo-gallery',
  standalone: true,
  imports: [ButtonModule, DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      @for (photo of photos(); track photo.id) {
        <figure
          class="min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white"
        >
          <button
            type="button"
            class="relative grid aspect-[4/3] w-full place-items-center bg-slate-100"
            [attr.aria-label]="'Open photo: ' + (photo.caption || 'Site photo')"
            (click)="open(photo)"
            [disabled]="!images()[photo.id]"
          >
            @if (images()[photo.id]) {
              <img
                class="h-full w-full object-cover"
                [src]="images()[photo.id]"
                [alt]="photo.caption || 'Site photo'"
              />
            } @else {
              <span class="text-xs text-slate-500">{{
                failed()[photo.id] ? 'Photo unavailable' : 'Loading...'
              }}</span>
            }
          </button>
          <figcaption class="space-y-2 p-2 text-xs text-slate-600">
            @if (photo.caption) {
              <p class="whitespace-pre-wrap break-words text-sm text-slate-800">
                {{ photo.caption }}
              </p>
            }
            @if (showVisibility()) {
              <span>{{
                photo.clientVisible ? 'Visible to client' : 'Internal only'
              }}</span>
            }
            @if (failed()[photo.id]) {
              <button
                pButton
                size="small"
                text
                icon="pi pi-refresh"
                label="Retry"
                (click)="retry.update(increment)"
              ></button>
            }
            @if (editable()) {
              <div class="flex justify-between gap-1">
                <button
                  pButton
                  size="small"
                  text
                  icon="pi pi-pencil"
                  aria-label="Edit photo"
                  title="Edit caption and visibility"
                  (click)="editPhoto.emit(photo)"
                ></button>
                <button
                  pButton
                  size="small"
                  text
                  severity="danger"
                  icon="pi pi-trash"
                  aria-label="Remove photo"
                  title="Remove photo"
                  (click)="deletePhoto.emit(photo)"
                ></button>
              </div>
            }
          </figcaption>
        </figure>
      }
    </div>
    <p-dialog
      header="Site photo"
      closeAriaLabel="Close photo"
      [visible]="!!viewing()"
      [modal]="true"
      [style]="{ width: 'min(68rem,96vw)' }"
      (visibleChange)="!$event && viewing.set(null)"
    >
      @if (viewing(); as photo) {
        @if (images()[photo.id]) {
          <img
            class="mx-auto max-h-[70dvh] max-w-full object-contain"
            [src]="images()[photo.id]"
            [alt]="photo.caption || 'Site photo'"
          />
        } @else {
          <p class="py-12 text-center text-sm text-slate-500">
            {{ failed()[photo.id] ? 'Photo unavailable' : 'Loading photo...' }}
          </p>
        }
        <p class="mt-3 whitespace-pre-wrap break-words text-sm">
          {{ photo.caption }}
        </p>
        <div class="mt-3 flex items-center justify-between gap-3">
          <button
            pButton
            severity="secondary"
            icon="pi pi-chevron-left"
            aria-label="Previous photo"
            [disabled]="photos().length < 2"
            (click)="move(-1)"
          ></button>
          <span class="text-sm text-slate-500"
            >{{ photos().indexOf(photo) + 1 }} / {{ photos().length }}</span
          >
          <button
            pButton
            severity="secondary"
            icon="pi pi-download"
            aria-label="Download photo"
            (click)="download(photo)"
          ></button>
          <button
            pButton
            severity="secondary"
            icon="pi pi-chevron-right"
            aria-label="Next photo"
            [disabled]="photos().length < 2"
            (click)="move(1)"
          ></button>
        </div>
      }
    </p-dialog>
  `,
})
export class QuotePhotoGalleryComponent {
  readonly photos = input<QuotePhoto[]>([]);
  readonly imageLoader = input.required<(id: string) => Observable<Blob>>();
  readonly editable = input(false);
  readonly showVisibility = input(false);
  readonly editPhoto = output<QuotePhoto>();
  readonly deletePhoto = output<QuotePhoto>();
  protected readonly images = signal<Record<string, string>>({});
  protected readonly failed = signal<Record<string, boolean>>({});
  protected readonly viewing = signal<QuotePhoto | null>(null);
  protected readonly retry = signal(0);
  protected readonly increment = (value: number) => value + 1;

  constructor() {
    effect((onCleanup) => {
      const photos = this.photos();
      const load = this.imageLoader();
      this.retry();
      this.viewing.set(null);
      this.images.set({});
      this.failed.set({});
      const urls: string[] = [];
      const subscriptions = photos.map((photo) =>
        load(photo.id).subscribe({
          next: (blob) => {
            const url = URL.createObjectURL(blob);
            urls.push(url);
            this.images.update((old) => ({ ...old, [photo.id]: url }));
          },
          error: () =>
            this.failed.update((old) => ({ ...old, [photo.id]: true })),
        }),
      );
      onCleanup(() => {
        subscriptions.forEach((sub) => sub.unsubscribe());
        urls.forEach((url) => URL.revokeObjectURL(url));
      });
    });
  }
  protected open(photo: QuotePhoto) {
    this.viewing.set(photo);
  }
  protected move(step: number) {
    const photos = this.photos();
    const index = photos.findIndex((photo) => photo.id === this.viewing()?.id);
    this.viewing.set(photos[(index + step + photos.length) % photos.length]);
  }
  protected download(photo: QuotePhoto) {
    const anchor = document.createElement('a');
    anchor.href = this.images()[photo.id];
    anchor.download = `quote-photo-${photo.id}.jpg`;
    anchor.click();
  }
}
