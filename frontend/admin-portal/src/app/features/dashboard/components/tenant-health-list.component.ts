import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SuperAdminOverviewResponse } from '@lorne/contracts';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'lorne-tenant-health-list',
  standalone: true,
  imports: [CardModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card>
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Tenant estate</p>
          <h2 class="mt-1 text-xl font-bold text-slate-950">Tenant health</h2>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{{ tenants().length }} tenants</span>
      </div>
      <div class="mt-4 divide-y divide-slate-100">
        @for (tenant of tenants(); track tenant.tenantName) {
          <div class="grid gap-3 py-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <div>
              <p class="font-semibold text-slate-950">{{ tenant.tenantName }}</p>
              <p class="text-sm font-medium text-slate-500">{{ tenant.plan }}</p>
            </div>
            <p-tag [value]="tenant.status" severity="success" />
            <div class="flex gap-2 text-sm font-bold text-slate-600">
              <span class="rounded-full bg-slate-100 px-3 py-1">{{ tenant.activeWorkers }} workers</span>
              <span class="rounded-full bg-slate-100 px-3 py-1">{{ tenant.openWorkOrders }} jobs</span>
            </div>
          </div>
        }
      </div>
    </p-card>
  `
})
export class TenantHealthListComponent {
  readonly tenants = input.required<SuperAdminOverviewResponse['tenantHealth']>();
}
