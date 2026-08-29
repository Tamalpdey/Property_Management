import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'lorne-voice-note-button',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      pButton
      type="button"
      size="small"
      severity="secondary"
      icon="pi pi-microphone"
      [label]="buttonLabel()"
      [disabled]="disabled() || !supported() || listening()"
      (click)="startDictation()"
    ></button>
    @if (showUnsupported() && !supported()) {
      <span class="text-xs font-bold text-slate-500">Voice dictation is not supported by this browser.</span>
    }
  `
})
export class VoiceNoteButtonComponent {
  readonly text = input('');
  readonly label = input('Speak note');
  readonly listeningLabel = input('Listening...');
  readonly disabled = input(false);
  readonly showUnsupported = input(false);
  readonly textChange = output<string>();
  readonly error = output<string>();

  protected readonly listening = signal(false);
  protected readonly supported = computed(() => {
    const browserWindow = window as unknown as SpeechRecognitionWindow;
    return Boolean(browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition);
  });
  protected readonly buttonLabel = computed(() => this.listening() ? this.listeningLabel() : this.label());

  protected startDictation(): void {
    const browserWindow = window as unknown as SpeechRecognitionWindow;
    const SpeechRecognitionConstructor = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor || this.listening()) {
      return;
    }
    const recognition = new SpeechRecognitionConstructor();
    const baseText = this.text().trim();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => this.listening.set(true);
    recognition.onend = () => this.listening.set(false);
    recognition.onerror = () => {
      this.listening.set(false);
      this.error.emit('Voice dictation stopped. You can type the note manually.');
    };
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const transcript = finalTranscript(event);
      if (transcript) {
        this.textChange.emit(baseText ? `${baseText}\n${transcript}` : transcript);
      }
    };
    recognition.start();
  }
}

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start(): void;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript?: string }> {
  isFinal?: boolean;
}

function finalTranscript(event: SpeechRecognitionEventLike): string {
  const results = event.results;
  if (!results?.length) {
    return '';
  }
  const transcripts: string[] = [];
  for (let index = event.resultIndex ?? 0; index < results.length; index++) {
    const result = results[index];
    if (result?.isFinal !== false) {
      const transcript = result[0]?.transcript?.trim();
      if (transcript) {
        transcripts.push(transcript);
      }
    }
  }
  return transcripts.join(' ').trim();
}
