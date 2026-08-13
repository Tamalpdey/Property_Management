import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SuperAdminOverviewResponse } from '@lorne/contracts';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'lorne-platform-metric-card',
  standalone: true,
  imports: [CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">{{ metric().label }}</p>
          <p class="mt-3 text-3xl font-bold leading-none text-slate-950">{{ metric().value }}</p>
        </div>
        <span class="grid h-11 w-11 place-items-center rounded-lg bg-slate-100 text-slate-800">
          <i [class]="metric().icon"></i>
        </span>
      </div>
    </article>
  `
})
export class PlatformMetricCardComponent {
  readonly metric = input.required<SuperAdminOverviewResponse['metrics'][number]>();
}
