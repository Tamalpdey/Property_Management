import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerAssignedJob } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'lorne-worker-calendar-strip',
  standalone: true,
  imports: [ButtonModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="overflow-hidden rounded-lg border border-teal-100 bg-white shadow-sm">
      <div class="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
        <button pButton type="button" text rounded icon="pi pi-chevron-left" aria-label="Previous week" (click)="move.emit(-7)"></button>
        <div class="text-center">
          <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Worker calendar</p>
          <p class="text-base font-black text-slate-950">{{ selectedDate() | date:'MMMM d, y' }}</p>
        </div>
        <button pButton type="button" text rounded icon="pi pi-chevron-right" aria-label="Next week" (click)="move.emit(7)"></button>
      </div>

      <div class="px-3 pt-3 sm:px-4">
        <button pButton type="button" size="small" severity="secondary" icon="pi pi-calendar-clock" label="Jump to today" class="w-full" (click)="dateSelected.emit(todayKey())"></button>
      </div>

      <div class="grid grid-cols-7 gap-1 p-3 sm:gap-2 sm:p-4">
        @for (day of days(); track day.key) {
          <button
            type="button"
            class="touch-action rounded-lg border px-1 py-3 text-center transition sm:py-4"
            [class.border-teal-500]="day.key === selectedDate()"
            [class.bg-teal-50]="day.key === selectedDate()"
            [class.shadow-sm]="day.key === selectedDate()"
            [class.border-slate-200]="day.key !== selectedDate()"
            [class.bg-white]="day.key !== selectedDate()"
            (click)="dateSelected.emit(day.key)"
          >
            <span class="block text-[0.7rem] font-bold uppercase text-slate-500">{{ day.date | date:'EEE' }}</span>
            <span class="mt-1 block text-xl font-black text-slate-950">{{ day.date | date:'d' }}</span>
            <span
              class="mt-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.72rem] font-black"
              [class.bg-slate-950]="day.count > 0"
              [class.text-white]="day.count > 0"
              [class.bg-slate-100]="day.count === 0"
              [class.text-slate-500]="day.count === 0"
            >{{ day.count }}</span>
          </button>
        }
      </div>
    </section>
  `
})
export class WorkerCalendarStripComponent {
  selectedDate = input.required<string>();
  jobs = input.required<WorkerAssignedJob[]>();
  dateSelected = output<string>();
  move = output<number>();

  protected days(): Array<{ key: string; date: Date; count: number }> {
    const anchor = parseDateInput(this.selectedDate());
    const start = new Date(anchor);
    start.setDate(anchor.getDate() - 3);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      const key = toDateInput(date);
      return {
        key,
        date,
        count: this.jobs().filter((job) => job.scheduledStart && toDateInput(new Date(job.scheduledStart)) === key).length
      };
    });
  }

  protected todayKey(): string {
    return toDateInput(new Date());
  }
}

function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toDateInput(date: Date): string {
  const pad = (part: number) => part.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
