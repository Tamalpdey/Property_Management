import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { CreateTenantUserRequest, TenantRoleOption, TenantUserRecord, UpdateTenantUserRequest, WorkerRecord } from '@lorne/contracts';
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

      <lorne-tenant-user-list
        [users]="users()"
        [currentUserId]="auth.currentUser()?.id ?? null"
        [lastAdminId]="lastAdminId()"
        (editUser)="openEdit($event)"
        (activateUser)="activate($event)"
        (deactivateUser)="deactivate($event)"
        (deleteUser)="delete($event)"
      />

      <lorne-tenant-user-dialog
        [visible]="showCreate()"
        [roles]="roles()"
        [workers]="workers()"
        [editingUser]="editingUser()"
        [title]="editingUser() ? 'Update tenant user' : 'Add tenant user'"
        [submitLabel]="editingUser() ? 'Save user' : 'Create user'"
        [saving]="saving()"
        [adminRoleLocked]="editingUser() !== null && editingUser()?.id === lastAdminId()"
        [errorMessage]="error()"
        (visibleChange)="closeDialog($event)"
        (saveUser)="save($event)"
      />
    </section>
  `
})
export class TenantUserPageComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly tenantUserService = inject(TenantUserService);
  private readonly workerManagementService = inject(WorkerManagementService);
  protected readonly users = signal<TenantUserRecord[]>([]);
  protected readonly lastAdminId = computed(() => {
    const ids = new Set(this.users().filter(user => user.status === 'ACTIVE' && user.roles.includes('TENANT_ADMIN')).map(user => user.id));
    return ids.size === 1 ? [...ids][0] : null;
  });
  protected readonly roles = signal<TenantRoleOption[]>([]);
  protected readonly workers = signal<WorkerRecord[]>([]);
  protected readonly saving = signal(false);
  protected readonly showCreate = signal(false);
  protected readonly editingUser = signal<TenantUserRecord | null>(null);
  protected readonly error = signal('');

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      const [users, roles, workers] = await Promise.all([
        firstValueFrom(this.tenantUserService.list()),
        firstValueFrom(this.tenantUserService.roles()),
        firstValueFrom(this.workerManagementService.list())
      ]);
      this.users.set(users);
      this.roles.set(roles);
      this.workers.set(workers);
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Unable to load tenant users.'));
    }
  }

  openCreate(): void {
    this.error.set('');
    this.editingUser.set(null);
    this.showCreate.set(true);
  }

  openEdit(user: TenantUserRecord): void {
    this.error.set('');
    this.editingUser.set(user);
    this.showCreate.set(true);
  }

  closeDialog(visible: boolean): void {
    this.showCreate.set(visible);
    if (!visible) {
      this.editingUser.set(null);
    }
  }

  async save(request: CreateTenantUserRequest | UpdateTenantUserRequest): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const editingUser = this.editingUser();
      const user = editingUser
        ? await firstValueFrom(this.tenantUserService.update(editingUser.id, request as UpdateTenantUserRequest))
        : await firstValueFrom(this.tenantUserService.create(request as CreateTenantUserRequest));
      this.users.update((users) => [user, ...users.filter((candidate) => candidate.id !== user.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.showCreate.set(false);
      this.editingUser.set(null);
      const current = this.auth.currentUser();
      if (current?.id === user.id && (current.roles.length !== user.roles.length || current.roles.some(role => !user.roles.includes(role as typeof user.roles[number])))) {
        this.auth.signOut();
        await this.router.navigate(['/login']);
        return;
      }
      await this.refreshWorkers();
    } catch (error) {
      this.error.set(error instanceof HttpErrorResponse
        ? error.error?.error?.message || error.error?.message || 'Unable to save tenant user. Check email, role selection, worker link, or backend status.'
        : 'Unable to save tenant user. Check email, role selection, worker link, or backend status.');
    } finally {
      this.saving.set(false);
    }
  }

  async activate(user: TenantUserRecord): Promise<void> {
    await this.replaceUser(firstValueFrom(this.tenantUserService.activate(user.id)), 'Unable to activate tenant user.');
  }

  async deactivate(user: TenantUserRecord): Promise<void> {
    await this.replaceUser(firstValueFrom(this.tenantUserService.deactivate(user.id)), 'Unable to deactivate tenant user.');
  }

  async delete(user: TenantUserRecord): Promise<void> {
    if (!confirm(`Remove ${user.displayName} from this tenant? Their login will be disabled if it has no other tenant access.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.tenantUserService.delete(user.id));
      this.users.update((users) => users.filter((candidate) => candidate.id !== user.id));
      await this.refreshWorkers();
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Unable to remove tenant user.'));
    }
  }

  private async replaceUser(userPromise: Promise<TenantUserRecord>, message: string): Promise<void> {
    this.error.set('');
    try {
      const updated = await userPromise;
      this.users.update((users) => [updated, ...users.filter((user) => user.id !== updated.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    } catch (error) {
      this.error.set(apiErrorMessage(error, message));
    }
  }

  private async refreshWorkers(): Promise<void> {
    this.workers.set(await firstValueFrom(this.workerManagementService.list()));
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpErrorResponse ? error.error?.error?.message || error.error?.message || fallback : fallback;
}
