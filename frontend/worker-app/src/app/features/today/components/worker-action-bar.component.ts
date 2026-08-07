import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerJobAction } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'lorne-worker-action-bar',
  standalone: true,
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-3 sm:grid-cols-4">
      <button
        pButton
        type="button"
        size="large"
        icon="pi pi-play"
        class="touch-action w-full"
        [label]="primaryLabel()"
        [disabled]="primaryDisabled()"
        [loading]="busy()"
        (click)="primary.emit()"
      ></button>
      @for (action of actions(); track action.label) {
        <button
          pButton
          type="button"
          size="large"
          class="touch-action w-full"
          [severity]="action.severity"
          [icon]="action.icon"
          [label]="action.label"
          [disabled]="busy() || action.disabled"
          (click)="quick.emit(action.action)"
        ></button>
      }
    </div>
  `
})
export class WorkerActionBarComponent {
  primaryLabel = input.required<string>();
  primaryDisabled = input(false);
  busy = input(false);
  actions = input.required<Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction; disabled?: boolean }>>();
  primary = output<void>();
  quick = output<WorkerJobAction>();
}
