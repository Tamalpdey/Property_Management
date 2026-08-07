import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SuperAdminOverviewResponse } from '@lorne/contracts';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'lorne-admin-action-list',
  standalone: true,
  imports: [CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card>
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Control queue</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">Priority actions</h2>
      </div>
      <div class="mt-4 grid gap-3">
        @for (action of actions(); track action.label) {
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div class="flex items-start justify-between gap-3">
              <p class="font-semibold text-slate-950">{{ action.label }}</p>
              <p-tag [severity]="action.severity" [value]="action.severity" />
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-600">{{ action.description }}</p>
          </div>
        }
      </div>
    </p-card>
  `
})
export class AdminActionListComponent {
  readonly actions = input.required<SuperAdminOverviewResponse['priorityActions']>();
}
