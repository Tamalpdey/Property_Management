import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

export interface QuotePhotoUpload {
  files: File[];
  caption: string;
  clientVisible: boolean;
  uploadIds?: string[];
}

@Component({
  selector: 'lorne-quote-photo-upload',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3">
      <label class="block text-sm font-semibold text-slate-700"
        >Photo caption
        <input
          pInputText
          class="mt-1 w-full"
          [(ngModel)]="caption"
          maxlength="500"
          [disabled]="busy()"
        />
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-700"
        ><input
          type="checkbox"
          [(ngModel)]="clientVisible"
          [disabled]="busy()"
        />
        Visible to client</label
      >
      <input
        #uploadInput
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        (change)="choose($event)"
      />
      <input
        #cameraInput
        type="file"
        accept="image/*"
        capture="environment"
        class="hidden"
        (change)="choose($event)"
      />
      <div class="flex flex-wrap gap-2">
        <button
          pButton
          severity="secondary"
          icon="pi pi-images"
          label="Upload photos"
          [disabled]="busy()"
          (click)="uploadInput.click()"
        ></button>
        <button
          pButton
          severity="secondary"
          icon="pi pi-camera"
          label="Take photo"
          [disabled]="busy()"
          (click)="cameraInput.click()"
        ></button>
      </div>
      @if (busy()) {
        <p class="text-sm text-slate-500" role="status">
          {{ progress() || 'Uploading...' }}
        </p>
      }
    </div>
  `,
})
export class QuotePhotoUploadComponent {
  readonly busy = input(false);
  readonly progress = input('');
  readonly upload = output<QuotePhotoUpload>();
  protected caption = '';
  protected clientVisible = true;
  protected choose(event: Event) {
    const target = event.target as HTMLInputElement;
    const files = Array.from(target.files || []);
    target.value = '';
    if (files.length && !this.busy())
      this.upload.emit({
        files,
        caption: this.caption,
        clientVisible: this.clientVisible,
      });
  }
}

// Browser decoding applies camera orientation; JPEG conversion removes GPS/EXIF metadata.
export async function prepareQuotePhoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size > 40 * 1024 * 1024)
    throw new Error('Select an image smaller than 40 MB.');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file);
  } catch {
    throw new Error(
      'This photo format cannot be opened. Export it as JPG or PNG and try again.',
    );
  }
  try {
    const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error('Photo processing failed.')),
        'image/jpeg',
        0.85,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
    });
  } finally {
    image.close();
  }
}
