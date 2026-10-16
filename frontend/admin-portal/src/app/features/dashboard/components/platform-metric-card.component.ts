import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SuperAdminOverviewResponse } from '@lorne/contracts';

@Component({
  selector: 'lorne-platform-metric-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="h-full p-4 sm:p-5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="min-h-8 text-xs font-medium text-slate-500 sm:min-h-0">{{ metric().label }}</p>
          <p class="mt-3 text-3xl font-bold leading-none text-slate-950">{{ metric().value }}</p>
        </div>
        <span class="hidden h-8 w-8 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700 sm:grid">
          <i [class]="metric().icon"></i>
        </span>
      </div>
    </article>
  `
})
export class PlatformMetricCardComponent {
  readonly metric = input.required<SuperAdminOverviewResponse['metrics'][number]>();
}
