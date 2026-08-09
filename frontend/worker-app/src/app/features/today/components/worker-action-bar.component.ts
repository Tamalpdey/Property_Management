import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { WorkerJobAction } from '@lorne/contracts';

@Component({
  selector: 'lorne-worker-action-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="worker-action-bar">
      <button
        type="button"
        class="worker-action worker-action--primary"
        [disabled]="primaryDisabled()"
        [class.worker-action--busy]="busy()"
        (click)="primary.emit()"
      >
        <i [class]="busy() ? 'pi pi-spinner pi-spin' : 'pi pi-play'"></i>
        <span>{{ primaryLabel() }}</span>
      </button>
      @for (action of actions(); track action.label) {
        <button
          type="button"
          class="worker-action"
          [class.worker-action--secondary]="action.severity === 'secondary'"
          [class.worker-action--success]="action.severity === 'success'"
          [class.worker-action--info]="action.severity === 'info'"
          [class.worker-action--warn]="action.severity === 'warn'"
          [class.worker-action--danger]="action.severity === 'danger'"
          [disabled]="busy() || action.disabled"
          (click)="quick.emit(action.action)"
        >
          <i [class]="action.icon"></i>
          <span>{{ action.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    .worker-action-bar {
      display: grid;
      gap: 0.5rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .worker-action {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 0.65rem;
      display: inline-flex;
      font-size: 0.9rem;
      font-weight: 900;
      gap: 0.45rem;
      justify-content: center;
      line-height: 1;
      min-height: 3rem;
      padding: 0 0.55rem;
      transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
      width: 100%;
    }

    .worker-action:active:not(:disabled) {
      transform: scale(0.985);
    }

    .worker-action:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .worker-action--primary {
      background: #10b981;
      color: white;
      font-size: 1.05rem;
      min-height: 3.35rem;
    }

    .worker-action--secondary {
      background: #f1f5f9;
      color: #475569;
    }

    .worker-action--info {
      background: #e0f2fe;
      color: #0369a1;
    }

    .worker-action--success {
      background: #dcfce7;
      color: #166534;
    }

    .worker-action--warn {
      background: #fef3c7;
      color: #92400e;
    }

    .worker-action--danger {
      background: #ef4444;
      color: white;
    }

    @media (max-width: 420px) {
      .worker-action {
        flex-direction: column;
        font-size: 0.78rem;
        gap: 0.25rem;
        min-height: 2.8rem;
      }

      .worker-action--primary {
        flex-direction: row;
        font-size: 1rem;
        min-height: 3.2rem;
      }
    }

    @media (min-width: 640px) {
      .worker-action-bar {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
  `]
})
export class WorkerActionBarComponent {
  primaryLabel = input.required<string>();
  primaryDisabled = input(false);
  busy = input(false);
  actions = input.required<Array<{ label: string; icon: string; severity: 'secondary' | 'success' | 'info' | 'warn' | 'danger'; action: WorkerJobAction; disabled?: boolean }>>();
  primary = output<void>();
  quick = output<WorkerJobAction>();
}
