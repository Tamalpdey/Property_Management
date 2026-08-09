import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TenantMetric {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone: 'teal' | 'blue' | 'amber';
}

@Component({
  selector: 'lorne-tenant-metric-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="h-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div class="flex items-center justify-between gap-2.5">
        <div>
          <p class="text-[0.8rem] font-bold uppercase tracking-wide text-slate-500">{{ metric().label }}</p>
          <p class="mt-0.5 text-2xl font-bold leading-none text-slate-950">{{ metric().value }}</p>
          <p class="mt-1 text-[0.84rem] font-medium text-slate-600">{{ metric().detail }}</p>
        </div>
        <span
          class="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          [class.bg-teal-50]="metric().tone === 'teal'"
          [class.text-teal-700]="metric().tone === 'teal'"
          [class.bg-blue-50]="metric().tone === 'blue'"
          [class.text-blue-700]="metric().tone === 'blue'"
          [class.bg-amber-50]="metric().tone === 'amber'"
          [class.text-amber-700]="metric().tone === 'amber'"
        >
          <i [class]="metric().icon"></i>
        </span>
      </div>
    </article>
  `
})
export class TenantMetricCardComponent {
  readonly metric = input.required<TenantMetric>();
}
