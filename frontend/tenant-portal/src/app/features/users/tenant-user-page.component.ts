import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { CreateTenantUserRequest, TenantRoleOption, TenantUserRecord, WorkerRecord } from '@lorne/contracts';
import { WorkerManagementService } from '../workers/services/worker-management.service';
import { TenantUserDialogComponent } from './components/tenant-user-dialog.component';
import { TenantUserListComponent } from './components/tenant-user-list.component';
import { TenantUserService } from './services/tenant-user.service';

@Component({
  selector: 'lorne-tenant-user-page',
  standalone: true,
  imports: [ButtonModule, TagModule, TenantUserDialogComponent, TenantUserListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Access" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Users</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ users().length }} records</span>
          </div>
          <div class="flex gap-2">
            <button pButton type="button" icon="pi pi-plus" label="Add user" (click)="openCreate()"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-tenant-user-list [users]="users()" />

      <lorne-tenant-user-dialog
        [visible]="showCreate()"
        [roles]="roles()"
        [workers]="workers()"
        [saving]="saving()"
        (visibleChange)="showCreate.set($event)"
        (createUser)="create($event)"
      />
    </section>
  `
})
export class TenantUserPageComponent {
  private readonly tenantUserService = inject(TenantUserService);
  private readonly workerManagementService = inject(WorkerManagementService);
  protected readonly users = signal<TenantUserRecord[]>([]);
  protected readonly roles = signal<TenantRoleOption[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly saving = signal(false);
  protected readonly showCreate = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [users, roles, workers] = await Promise.all([
      firstValueFrom(this.tenantUserService.list()),
      firstValueFrom(this.tenantUserService.roles()),
      firstValueFrom(this.workerManagementService.list())
    ]);
    this.users.set(users);
    this.roles.set(roles);
    this.workers.set(workers);
  }

  openCreate(): void {
    this.showCreate.set(true);
  }

  async create(request: CreateTenantUserRequest): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const user = await firstValueFrom(this.tenantUserService.create(request));
      this.users.update((users) => [user, ...users.filter((candidate) => candidate.id !== user.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.showCreate.set(false);
    } catch {
      this.error.set('Unable to create tenant user. Check email, role selection, worker link, or backend status.');
    } finally {
      this.saving.set(false);
    }
  }
}
