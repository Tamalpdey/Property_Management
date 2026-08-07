import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerJobChecklistItem } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'lorne-worker-checklist',
  standalone: true,
  imports: [ButtonModule, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-teal-700">{{ eyebrow() }}</p>
          <h3 class="mt-1 text-lg font-bold text-slate-950">{{ title() }}</h3>
          <p class="mt-1 text-xs font-semibold text-slate-500">{{ description() }}</p>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ completedCount() }}/{{ items().length }}</span>
      </div>
      @if (disabled() && items().length > 0) {
        <p class="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{{ disabledReason() }}</p>
      }
      <div class="mt-4 grid gap-2">
        @for (item of items(); track item.id) {
          <button
            type="button"
            class="touch-action flex items-center gap-3 rounded-lg border px-3 text-left text-sm font-bold"
            [class.border-teal-300]="item.completed"
            [class.bg-teal-50]="item.completed"
            [class.text-teal-900]="item.completed"
            [class.border-slate-200]="!item.completed"
            [class.bg-white]="!item.completed"
            [class.text-slate-700]="!item.completed"
            [disabled]="disabled() || item.completed || busyTaskId() === item.id"
            (click)="completeItem.emit(item)"
          >
            <i [class]="item.completed ? 'pi pi-check-circle text-teal-700' : 'pi pi-circle text-slate-300'"></i>
            <span>{{ item.label }}</span>
          </button>
        } @empty {
          <p class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm font-semibold text-slate-500">No checklist for this job.</p>
        }
      </div>
    </p-card>
  `
})
export class WorkerChecklistComponent {
  items = input.required<WorkerJobChecklistItem[]>();
  eyebrow = input('Required checks');
  title = input('Work checklist');
  description = input('Tap each required item after it is actually done.');
  busyTaskId = input<string>('');
  disabled = input(false);
  disabledReason = input('Checklist can be completed after work starts.');
  completeItem = output<WorkerJobChecklistItem>();

  protected completedCount(): number {
    return this.items().filter((item) => item.completed).length;
  }
}
