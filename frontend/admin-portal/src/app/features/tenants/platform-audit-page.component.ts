import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { PlatformAuditPage, SuperAdminTenantSummary } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { firstValueFrom } from 'rxjs';
import { SuperAdminTenantService } from './services/super-admin-tenant.service';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule],
  template: `
    <section class="workspace">
      <header class="heading"><div><p class="muted">Platform administration</p><h1>Audit log</h1></div><button pButton severity="secondary" icon="pi pi-refresh" aria-label="Refresh audit log" title="Refresh audit log" [disabled]="loading()" (click)="load(result().page)"></button></header>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      <form class="audit-filters" (ngSubmit)="load(0)">
        <label>Search<input name="query" maxlength="200" placeholder="Action, actor, support reason" [(ngModel)]="query" /></label>
        <label>Tenant<select name="tenantId" [(ngModel)]="tenantId"><option value="">All tenants</option>@for (tenant of tenants(); track tenant.id) { <option [value]="tenant.id">{{ tenant.displayName }}</option> }</select></label>
        <label>From<input type="date" name="from" [(ngModel)]="from" /></label>
        <label>Through<input type="date" name="through" [(ngModel)]="through" /></label>
        <button pButton type="submit" icon="pi pi-filter" label="Apply" [disabled]="loading()"></button>
      </form>
      @if (loading()) { <p class="muted" role="status">Loading audit events...</p> }
      <div class="table-scroll" [attr.aria-busy]="loading()">
        <table><thead><tr><th>When</th><th>Tenant</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
          <tbody>@for (entry of result().items; track entry.id) {
            <tr><td>{{ entry.createdAt | date:'medium' }}</td><td><a [routerLink]="['/tenants', entry.tenantId, 'support']">{{ entry.tenantName || entry.tenantId }}</a></td><td><strong>{{ actionLabel(entry.action) }}</strong><small>{{ entry.resourceType }}</small></td><td>{{ entry.actorName || 'System' }}<small>{{ entry.actorEmail }}</small></td><td class="preserve-text">{{ entry.detail || '-' }}</td></tr>
          } @empty { <tr><td colspan="5" class="empty">{{ loading() ? 'Loading...' : 'No platform events match these filters.' }}</td></tr> }</tbody>
        </table>
      </div>
      <footer class="pager"><span class="muted">{{ result().total }} events / Page {{ result().page + 1 }} of {{ pages() }}</span><div class="actions"><label class="muted">Rows <select aria-label="Audit page size" [ngModel]="size" (ngModelChange)="size = $event; load(0)"><option [ngValue]="25">25</option><option [ngValue]="50">50</option><option [ngValue]="100">100</option></select></label><button pButton severity="secondary" icon="pi pi-chevron-left" aria-label="Previous audit page" title="Previous page" [disabled]="loading() || result().page === 0" (click)="load(result().page - 1)"></button><button pButton severity="secondary" icon="pi pi-chevron-right" aria-label="Next audit page" title="Next page" [disabled]="loading() || result().page + 1 >= pages()" (click)="load(result().page + 1)"></button></div></footer>
    </section>
  `,
  styleUrls: ['./platform-support.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformAuditPageComponent {
  private readonly service = inject(SuperAdminTenantService);
  private readonly route = inject(ActivatedRoute);
  protected readonly tenants = signal<SuperAdminTenantSummary[]>([]);
  protected readonly result = signal<PlatformAuditPage>({ items: [], total: 0, page: 0, size: 25 });
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected query = '';
  protected tenantId = '';
  protected from = '';
  protected through = '';
  protected size = 25;
  private requestId = 0;
  private appliedFilters: { tenantId?: string; query?: string; from?: string; until?: string } = {};

  constructor() {
    void firstValueFrom(this.service.list()).then(tenants => this.tenants.set(tenants)).catch(error => this.error.set(message(error)));
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.tenantId = params.get('tenantId') ?? '';
      void this.load(0);
    });
  }

  protected pages(): number { return Math.max(1, Math.ceil(this.result().total / this.result().size)); }
  protected actionLabel(action: string): string { return action.replace(/^SUPERADMIN_/, '').toLowerCase().replaceAll('_', ' '); }
  protected async load(page: number): Promise<void> {
    let filters = this.appliedFilters;
    if (page === 0) {
      if (this.from && this.through && this.from > this.through) { this.error.set('The end date must be on or after the start date.'); return; }
      const start = this.from ? new Date(this.from + 'T00:00:00') : undefined;
      const until = this.through ? new Date(this.through + 'T00:00:00') : undefined;
      if (until) until.setDate(until.getDate() + 1);
      filters = { tenantId: this.tenantId || undefined, query: this.query.trim() || undefined, from: start?.toISOString(), until: until?.toISOString() };
    }
    const request = ++this.requestId;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.service.audit({ ...filters, page, size: this.size }));
      if (request === this.requestId) { this.result.set(result); this.appliedFilters = filters; }
    } catch (error) { if (request === this.requestId) this.error.set(message(error)); }
    finally { if (request === this.requestId) this.loading.set(false); }
  }
}

function message(error: unknown): string {
  return error instanceof HttpErrorResponse ? error.error?.error?.message || error.error?.message || 'Unable to load platform audit.' : 'Unable to load platform audit.';
}
