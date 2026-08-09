import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerTodayResponse, WorkerStepKey } from '@lorne/contracts';

@Component({
  selector: 'lorne-worker-stepper',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="worker-stepper">
      @for (step of steps(); track step.key; let index = $index) {
        <button
          type="button"
          class="worker-step"
          [class.worker-step--active]="index === currentIndex()"
          [class.worker-step--done]="index < currentIndex()"
          [class.worker-step--upcoming]="index > currentIndex()"
          (click)="stepSelected.emit(step.key)"
        >
          <span class="worker-step__icon">
            <i [class]="index < currentIndex() ? 'pi pi-check-circle' : step.icon"></i>
          </span>
          <span class="worker-step__label">{{ step.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .worker-stepper {
      background: white;
      border: 1px solid #ccfbf1;
      border-radius: 0.75rem;
      box-shadow: 0 8px 22px rgba(15, 118, 110, 0.1);
      display: grid;
      gap: 0.25rem;
      grid-template-columns: repeat(6, minmax(3.1rem, 1fr));
      overflow-x: auto;
      padding: 0.25rem;
      scrollbar-width: none;
    }

    .worker-stepper::-webkit-scrollbar {
      display: none;
    }

    .worker-step {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 0.6rem;
      display: grid;
      gap: 0.2rem;
      justify-items: center;
      min-height: 3.15rem;
      min-width: 3.1rem;
      padding: 0.35rem 0.25rem;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
    }

    .worker-step:active {
      transform: scale(0.985);
    }

    .worker-step__icon {
      display: grid;
      font-size: 1rem;
      line-height: 1;
      place-items: center;
    }

    .worker-step__label {
      font-size: 0.68rem;
      font-weight: 900;
      line-height: 1.05;
      text-align: center;
      white-space: normal;
    }

    .worker-step--active {
      background: #0d9488;
      border-color: #0f766e;
      box-shadow: 0 8px 18px rgba(13, 148, 136, 0.22);
      color: white;
    }

    .worker-step--done {
      background: #ecfdf5;
      border-color: #99f6e4;
      color: #0f766e;
    }

    .worker-step--upcoming {
      background: #f8fafc;
      color: #64748b;
    }

    @media (min-width: 640px) {
      .worker-stepper {
        gap: 0.35rem;
      }

      .worker-step {
        min-height: 4rem;
        padding: 0.5rem;
      }

      .worker-step__icon {
        font-size: 1.15rem;
      }

      .worker-step__label {
        font-size: 0.82rem;
      }
    }
  `]
})
export class WorkerStepperComponent {
  steps = input.required<WorkerTodayResponse['steps']>();
  currentStep = input.required<WorkerStepKey>();
  stepSelected = output<WorkerStepKey>();

  protected currentIndex(): number {
    return Math.max(0, this.steps().findIndex((step) => step.key === this.currentStep()));
  }
}
