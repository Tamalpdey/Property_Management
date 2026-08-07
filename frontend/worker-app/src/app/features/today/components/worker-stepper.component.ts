import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerTodayResponse, WorkerStepKey } from '@lorne/contracts';

@Component({
  selector: 'lorne-worker-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-3 gap-1 rounded-lg border border-teal-100 bg-white p-1 shadow-sm sm:grid-cols-6">
      @for (step of steps(); track step.key; let index = $index) {
        <button
          type="button"
          class="touch-action min-h-16 rounded-lg border px-2 py-2 text-center text-xs font-black transition"
          [class.border-teal-600]="index === currentIndex()"
          [class.bg-teal-600]="index === currentIndex()"
          [class.text-white]="index === currentIndex()"
          [class.shadow-md]="index === currentIndex()"
          [class.border-teal-100]="index < currentIndex()"
          [class.bg-teal-50]="index < currentIndex()"
          [class.text-teal-800]="index < currentIndex()"
          [class.border-transparent]="index > currentIndex()"
          [class.bg-slate-50]="index > currentIndex()"
          [class.text-slate-500]="index > currentIndex()"
          (click)="stepSelected.emit(step.key)"
        >
          <i class="text-lg" [class]="index < currentIndex() ? 'pi pi-check-circle' : step.icon"></i>
          <span class="mt-1 block">{{ step.label }}</span>
        </button>
      }
    </div>
  `
})
export class WorkerStepperComponent {
  steps = input.required<WorkerTodayResponse['steps']>();
  currentStep = input.required<WorkerStepKey>();
  stepSelected = output<WorkerStepKey>();

  protected currentIndex(): number {
    return Math.max(0, this.steps().findIndex((step) => step.key === this.currentStep()));
  }
}
