import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import type { SuperAdminOverviewResponse } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { AdminActionListComponent } from './components/admin-action-list.component';
import { PlatformMetricCardComponent } from './components/platform-metric-card.component';
import { TenantHealthListComponent } from './components/tenant-health-list.component';
import { SuperAdminOverviewService } from './services/super-admin-overview.service';

@Component({
  standalone: true,
  imports: [DatePipe, AdminActionListComponent, PlatformMetricCardComponent, RouterLink, ButtonModule, TenantHealthListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-dashboard.component.html', styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent {
  private readonly service = inject(SuperAdminOverviewService);
  protected readonly overview = signal<SuperAdminOverviewResponse | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly refreshedAt = signal<Date | null>(null);
  constructor() { void this.load(); }
  protected percentage(count: number, data: SuperAdminOverviewResponse): number {
    const total = data.tenantStatuses.reduce((sum, item) => sum + item.count, 0);
    return total ? count / total * 100 : 0;
  }
  protected statusColor(status: string): string {
    return ({ ACTIVE: '#0d9488', TRIAL: '#3b82f6', PAST_DUE: '#d97706', SUSPENDED: '#e11d48', CANCELLED: '#94a3b8' } as Record<string, string>)[status] || '#94a3b8';
  }
  protected label(status: string): string {
    return status === 'SUSPENDED' ? 'Inactive' : status.toLowerCase().replaceAll('_', ' ').replace(/^./, value => value.toUpperCase());
  }
  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    try { this.overview.set(await firstValueFrom(this.service.overview())); this.refreshedAt.set(new Date()); }
    catch (error) { this.error.set(error instanceof HttpErrorResponse ? error.error?.error?.message || 'Unable to load platform overview.' : 'Unable to load platform overview.'); }
    finally { this.loading.set(false); }
  }
}
