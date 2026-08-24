import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { WorkerShiftClockService } from '../core/services/worker-shift-clock.service';

@Component({
  selector: 'lorne-worker-shift-clock',
  standalone: true,
  imports: [ButtonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border-b border-teal-100 bg-white/95 shadow-sm backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-1.5 sm:px-5 sm:py-2">
        <div class="min-w-0">
          <p class="text-[0.68rem] font-black uppercase tracking-wide text-slate-500">Shift clock</p>
          @if (clock.error()) {
            <p class="truncate text-sm font-black text-red-700">{{ clock.error() }}</p>
          } @else {
          @if (clock.state().clockedIn) {
            <p class="truncate text-sm font-black sm:text-base" [class.text-amber-800]="clock.state().paused" [class.text-teal-800]="!clock.state().paused">
              {{ clock.state().paused ? 'Paused' : 'Clocked in' }} {{ activeDuration() }} · since {{ clock.state().startedAt | date:'shortTime' }}
            </p>
            @if (pauseDuration() !== '0m') {
              <p class="truncate text-[0.72rem] font-bold text-slate-500">Break {{ pauseDuration() }}{{ clock.state().pausedAt ? ' · paused ' + (clock.state().pausedAt | date:'shortTime') : '' }}</p>
            }
          } @else {
            <p class="truncate text-sm font-black text-slate-900 sm:text-base">
              Not clocked in{{ clock.state().endedAt ? ' · last out ' + (clock.state().endedAt | date:'shortTime') : '' }}
            </p>
          }
          }
        </div>
        @if (clock.state().clockedIn) {
          <div class="flex shrink-0 items-center gap-1.5">
            @if (clock.state().paused) {
              <button pButton type="button" size="small" severity="success" icon="pi pi-play-circle" label="Resume" [loading]="clock.loading()" (click)="clock.resume()"></button>
            } @else {
              <button pButton type="button" size="small" severity="secondary" icon="pi pi-pause-circle" label="Pause" [loading]="clock.loading()" (click)="clock.pause()"></button>
            }
            <button pButton type="button" size="small" severity="danger" icon="pi pi-stop-circle" label="Clock out" [loading]="clock.loading()" (click)="clock.clockOut()"></button>
          </div>
        } @else {
          <button pButton type="button" size="small" severity="success" icon="pi pi-play-circle" label="Clock in" class="shrink-0" [loading]="clock.loading()" (click)="clock.clockIn()"></button>
        }
      </div>
    </section>
  `
})
export class WorkerShiftClockComponent implements OnDestroy {
  protected readonly clock = inject(WorkerShiftClockService);
  protected readonly now = signal(Date.now());
  private readonly timerHandle = window.setInterval(() => this.now.set(Date.now()), 30000);

  ngOnDestroy(): void {
    window.clearInterval(this.timerHandle);
  }

  protected activeDuration(): string {
    const state = this.clock.state();
    if (!state.startedAt) {
      return '0m';
    }
    const rawMinutes = Math.max(0, Math.floor((this.now() - new Date(state.startedAt).getTime()) / 60000));
    return compactMinutes(Math.max(0, rawMinutes - this.pauseMinutes()));
  }

  protected pauseDuration(): string {
    return compactMinutes(this.pauseMinutes());
  }

  private pauseMinutes(): number {
    const state = this.clock.state();
    const completed = state.pauseMinutes ?? 0;
    const current = state.paused && state.pausedAt
      ? Math.max(0, Math.floor((this.now() - new Date(state.pausedAt).getTime()) / 60000))
      : 0;
    return completed + current;
  }
}

function compactMinutes(minutesValue: number): string {
  const totalMinutes = Math.max(0, Math.floor(minutesValue));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}
