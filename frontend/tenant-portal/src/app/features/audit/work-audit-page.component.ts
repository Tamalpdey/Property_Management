import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { AuditLogRecord } from '@lorne/contracts';
import { AuditLogListComponent } from './components/audit-log-list.component';
import { TenantAuditService } from './services/tenant-audit.service';

@Component({
  selector: 'lorne-work-audit-page',
  standalone: true,
  imports: [AuditLogListComponent, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Governance" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Work audit</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ logs().length }} events</span>
          </div>
          <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-audit-log-list [logs]="logs()" />
    </section>
  `
})
export class WorkAuditPageComponent {
  private readonly tenantAuditService = inject(TenantAuditService);
  protected readonly logs = signal<AuditLogRecord[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.loading()) {
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      this.logs.set(await firstValueFrom(this.tenantAuditService.list()));
    } catch {
      this.error.set('Unable to load audit activity. Check backend status and tenant permissions.');
    } finally {
      this.loading.set(false);
    }
  }
}
