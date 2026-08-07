import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TagModule } from 'primeng/tag';
import { AdminActionListComponent } from './components/admin-action-list.component';
import { PlatformMetricCardComponent } from './components/platform-metric-card.component';
import { TenantHealthListComponent } from './components/tenant-health-list.component';
import { SuperAdminOverviewService } from './services/super-admin-overview.service';

@Component({
  selector: 'lorne-admin-dashboard',
  standalone: true,
  imports: [AdminActionListComponent, PlatformMetricCardComponent, TagModule, TenantHealthListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <div class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div class="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p-tag value="Platform" severity="contrast" />
            <h1 class="mt-3 text-3xl font-bold leading-tight text-slate-950 md:text-4xl">Admin dashboard</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Tenant health, worker readiness, audit visibility, and runtime controls for the property-management platform.</p>
          </div>
          <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p class="text-xs font-bold uppercase tracking-wide text-emerald-700">Environment</p>
            <p class="mt-1 text-lg font-bold text-emerald-950">Operational</p>
          </div>
        </div>
      </div>

      @if (overview(); as data) {
        <div class="grid gap-4 md:grid-cols-3">
          @for (metric of data.metrics; track metric.label) {
            <lorne-platform-metric-card [metric]="metric" />
          }
        </div>

        <div class="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <lorne-tenant-health-list [tenants]="data.tenantHealth" />
          <lorne-admin-action-list [actions]="data.priorityActions" />
        </div>
      } @else {
        <div class="rounded border border-slate-200 bg-white p-6 text-slate-600">Loading platform overview...</div>
      }
    </section>
  `
})
export class AdminDashboardComponent {
  private readonly overviewService = inject(SuperAdminOverviewService);
  protected readonly overview = toSignal(this.overviewService.overview());
}
