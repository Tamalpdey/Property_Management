import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { WorkerShiftClockService } from '../core/services/worker-shift-clock.service';

@Component({
  selector: 'lorne-worker-shift-clock',
  standalone: true,
  imports: [ButtonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border-b border-teal-100 bg-white/95 shadow-sm backdrop-blur">
      <div class="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2 sm:px-5">
        <div class="min-w-0">
          <p class="text-[0.7rem] font-black uppercase tracking-wide text-slate-500">Shift clock</p>
          @if (clock.error()) {
            <p class="truncate text-sm font-black text-red-700">{{ clock.error() }}</p>
          } @else {
          @if (clock.state().clockedIn) {
            <p class="truncate text-sm font-black text-teal-800">Clocked in since {{ clock.state().startedAt | date:'shortTime' }}</p>
          } @else {
            <p class="truncate text-sm font-black text-slate-900">
              Not clocked in{{ clock.state().endedAt ? ' · last out ' + (clock.state().endedAt | date:'shortTime') : '' }}
            </p>
          }
          }
        </div>
        @if (clock.state().clockedIn) {
          <button pButton type="button" size="small" severity="danger" icon="pi pi-stop-circle" label="Clock out" [loading]="clock.loading()" (click)="clock.clockOut()"></button>
        } @else {
          <button pButton type="button" size="small" severity="success" icon="pi pi-play-circle" label="Clock in" [loading]="clock.loading()" (click)="clock.clockIn()"></button>
        }
      </div>
    </section>
  `
})
export class WorkerShiftClockComponent {
  protected readonly clock = inject(WorkerShiftClockService);
}
