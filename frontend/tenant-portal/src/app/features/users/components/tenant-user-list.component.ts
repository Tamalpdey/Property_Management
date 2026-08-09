import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TenantUserRecord } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';

@Component({
  selector: 'lorne-tenant-user-list',
  standalone: true,
  imports: [ButtonModule, DatePipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search users by name, email, role, worker profile..."
        [query]="collection.query()"
        [totalCount]="users().length"
        [filteredCount]="collection.filtered().length"
        [selectedCount]="collection.selectedCount()"
        [sortKey]="collection.sortKey()"
        [sortOptions]="collection.sortOptions"
        (queryChange)="collection.setQuery($event)"
        (sortKeyChange)="collection.setSort($event)"
        (clearSelection)="collection.clearSelection()"
      />

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[72rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">User</th>
                <th class="px-3 py-3">Roles</th>
                <th class="px-3 py-3">Worker profile</th>
                <th class="px-3 py-3">Status</th>
                <th class="px-3 py-3">Last login</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (user of collection.page(); track user.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(user)" (change)="collection.toggle(user)" />
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-bold text-slate-950">{{ user.displayName }}</p>
                    <p class="text-xs font-semibold text-slate-500">{{ user.email }}</p>
                    <p class="text-xs text-slate-500">{{ user.phone || 'No phone' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex max-w-sm flex-wrap gap-1">
                      @for (role of user.roles; track role) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{{ roleLabel(role) }}</span>
                      }
                    </div>
                  </td>
                  <td class="px-3 py-3">
                    @if (user.workerName) {
                      <p-tag [value]="user.workerName" severity="info" />
                    } @else if (user.roles.includes('FIELD_WORKER')) {
                      <span class="text-xs font-semibold text-amber-700">Not linked</span>
                    } @else {
                      <span class="text-xs font-semibold text-slate-400">Not needed</span>
                    }
                  </td>
                  <td class="px-3 py-3">
                    <p-tag [value]="user.status" [severity]="user.status === 'ACTIVE' ? 'success' : 'secondary'" />
                  </td>
                  <td class="px-3 py-3 text-slate-600">
                    {{ user.lastLoginAt ? (user.lastLoginAt | date:'MMM d, y, h:mm a') : 'Never' }}
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openUserMenu(user, $event, userMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No tenant users found.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #userMenu [popup]="true" [model]="userMenuItems()" appendTo="body" />

      <lorne-dense-collection-footer
        [filteredCount]="collection.filtered().length"
        [pageIndex]="collection.pageIndex()"
        [pageCount]="collection.pageCount()"
        [pageSize]="collection.pageSize()"
        (pageSizeChange)="collection.setPageSize($event)"
        (previousPage)="collection.previousPage()"
        (nextPage)="collection.nextPage()"
      />
    </div>
  `
})
export class TenantUserListComponent {
  readonly users = input.required<TenantUserRecord[]>();
  readonly editUser = output<TenantUserRecord>();
  readonly activateUser = output<TenantUserRecord>();
  readonly deactivateUser = output<TenantUserRecord>();
  readonly deleteUser = output<TenantUserRecord>();
  protected readonly selectedUser = signal<TenantUserRecord | null>(null);
  protected readonly userMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<TenantUserRecord>(
    this.users,
    (user) => user.id,
    (user) => [user.displayName, user.email, user.phone, user.status, user.workerName, ...user.roles].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.displayName.localeCompare(right.displayName) },
      { label: 'Status A-Z', value: 'status-asc', compare: (left, right) => left.status.localeCompare(right.status) },
      { label: 'Recent login', value: 'login-desc', compare: (left, right) => dateValue(right.lastLoginAt) - dateValue(left.lastLoginAt) },
      { label: 'Newest created', value: 'created-desc', compare: (left, right) => dateValue(right.createdAt) - dateValue(left.createdAt) }
    ]
  );

  protected roleLabel(role: string): string {
    return role.toLowerCase().replaceAll('_', ' ');
  }

  protected openUserMenu(user: TenantUserRecord, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedUser.set(user);
    this.userMenuItems.set([
      { label: 'Update user', icon: 'pi pi-user-edit', command: () => this.editUser.emit(user) },
      { label: 'Reset password', icon: 'pi pi-key', command: () => this.editUser.emit(user) },
      { separator: true },
      user.status === 'ACTIVE'
        ? { label: 'Deactivate user', icon: 'pi pi-ban', command: () => this.deactivateUser.emit(user) }
        : { label: 'Activate user', icon: 'pi pi-check-circle', command: () => this.activateUser.emit(user) },
      { label: 'Remove from tenant', icon: 'pi pi-trash', command: () => this.deleteUser.emit(user) }
    ]);
    menu.toggle(event);
  }
}

function dateValue(value?: string): number {
  return value ? new Date(value).getTime() : 0;
}
