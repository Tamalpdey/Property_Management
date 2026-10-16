import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { SuperAdminTenantDetail, TenantHealthReport, TenantSupportNote, TenantUserRecord, UpdateTenantPortalAccessRequest } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { SuperAdminTenantService } from './services/super-admin-tenant.service';
import { TenantAccessButtonComponent } from './tenant-access-button.component';
import type { TenantOperationsOverview } from '@lorne/contracts';
import { TenantQuoteTemplatesComponent } from '../quote-templates/tenant-quote-templates.component';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, DialogModule, TenantAccessButtonComponent, TenantQuoteTemplatesComponent],
  templateUrl: './tenant-support-page.component.html',
  styleUrls: ['./platform-support.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TenantSupportPageComponent {
  private readonly service = inject(SuperAdminTenantService);
  private readonly route = inject(ActivatedRoute);
  protected readonly detail = signal<SuperAdminTenantDetail | null>(null);
  protected readonly health = signal<TenantHealthReport | null>(null);
  protected readonly operations = signal<TenantOperationsOverview | null>(null);
  protected readonly users = signal<TenantUserRecord[]>([]);
  protected readonly notes = signal<TenantSupportNote[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly noteSaving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly editError = signal('');
  protected readonly tab = signal('overview');
  protected readonly query = signal('');
  protected readonly userStatus = signal('');
  protected readonly editing = signal<TenantUserRecord | null>(null);
  protected readonly portalOptions = [
    { code: 'TENANT_ADMIN' as const, label: 'Tenant Admin' },
    { code: 'OPERATIONS' as const, label: 'Operations' },
    { code: 'FINANCE' as const, label: 'Finance' },
  ];
  protected readonly filteredUsers = computed(() => this.users().filter(user =>
    (!this.userStatus() || user.status === this.userStatus()) &&
    `${user.displayName} ${user.email} ${user.roles.join(' ')}`.toLowerCase().includes(this.query().trim().toLowerCase())));
  protected readonly tabs = [
    { key: 'overview', label: 'Overview', icon: 'pi pi-chart-bar' },
    { key: 'health', label: 'Setup health', icon: 'pi pi-heart' },
    { key: 'users', label: 'Users & access', icon: 'pi pi-users' },
    { key: 'notes', label: 'Support notes', icon: 'pi pi-comment' },
    { key: 'quoteTemplates', label: 'Quote templates', icon: 'pi pi-file-edit' },
  ];
  protected access: UpdateTenantPortalAccessRequest = { portalRoles: [], reactivate: false, reason: '' };
  protected note = '';
  private tenantId = '';
  private requestId = 0;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.tenantId = params.get('tenantId') ?? '';
      this.detail.set(null); this.health.set(null); this.users.set([]); this.notes.set([]);
      this.operations.set(null); this.editing.set(null); this.note = ''; this.tab.set('overview');
      void this.load();
    });
  }

  protected async load(): Promise<void> {
    const request = ++this.requestId;
    this.loading.set(true); this.error.set('');
    try {
      const [detail, health, users, notes, operations] = await Promise.all([
        firstValueFrom(this.service.detail(this.tenantId)), firstValueFrom(this.service.health(this.tenantId)),
        firstValueFrom(this.service.users(this.tenantId)), firstValueFrom(this.service.notes(this.tenantId)),
        firstValueFrom(this.service.operations(this.tenantId)),
      ]);
      if (request !== this.requestId) return;
      this.detail.set(detail); this.health.set(health); this.users.set(users); this.notes.set(notes); this.operations.set(operations);
    } catch (error) { if (request === this.requestId) this.error.set(errorMessage(error)); }
    finally { if (request === this.requestId) this.loading.set(false); }
  }

  protected openAccess(user: TenantUserRecord): void {
    if (this.saving() || this.loading()) return;
    this.editError.set('');
    this.access = { portalRoles: this.portalOptions.filter(option => user.roles.includes(option.code)).map(option => option.code), reactivate: false, reason: '' };
    this.editing.set(user);
  }

  protected toggleRole(role: 'TENANT_ADMIN' | 'OPERATIONS' | 'FINANCE', event: Event): void {
    this.access.portalRoles = (event.target as HTMLInputElement).checked
      ? [...this.access.portalRoles.filter(code => code !== role), role]
      : this.access.portalRoles.filter(code => code !== role);
  }

  protected lastAdmin(user: TenantUserRecord): boolean {
    return user.status === 'ACTIVE' && user.roles.includes('TENANT_ADMIN') && this.health()?.activeAdministrators === 1;
  }

  protected async saveAccess(): Promise<void> {
    const user = this.editing();
    if (!user || this.saving()) return;
    if (this.access.reason.trim().length < 10) { this.editError.set('Enter a support reason of at least 10 characters.'); return; }
    this.saving.set(true); this.editError.set(''); this.notice.set('');
    const id = this.tenantId;
    try {
      const updated = await firstValueFrom(this.service.updatePortalAccess(id, user.id, { ...this.access, reason: this.access.reason.trim() }));
      if (id !== this.tenantId) return;
      this.users.update(users => users.map(item => item.id === updated.id ? updated : item));
      this.editing.set(null);
      this.notice.set('Portal access updated and audited. Ask the user to sign in again to refresh permissions.');
      const report = await firstValueFrom(this.service.health(id));
      if (id === this.tenantId) this.health.set(report);
    } catch (error) {
      if (id === this.tenantId) {
        if (this.editing()) this.editError.set(errorMessage(error));
        else this.error.set(errorMessage(error));
      }
    } finally { this.saving.set(false); }
  }

  protected async addNote(): Promise<void> {
    if (!this.note.trim() || this.noteSaving()) return;
    this.noteSaving.set(true); this.error.set('');
    const id = this.tenantId;
    try {
      const notes = await firstValueFrom(this.service.addNote(id, this.note.trim()));
      if (id !== this.tenantId) return;
      this.notes.set(notes); this.note = ''; this.notice.set('Private support note saved.');
    } catch (error) { if (id === this.tenantId) this.error.set(errorMessage(error)); }
    finally { this.noteSaving.set(false); }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof HttpErrorResponse ? error.error?.error?.message || error.error?.message || 'Unable to complete this support operation.' : 'Unable to complete this support operation.';
}
