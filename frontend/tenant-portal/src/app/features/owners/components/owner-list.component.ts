import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { PropertyOwner } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

@Component({
  selector: 'lorne-owner-list',
  standalone: true,
  imports: [ButtonModule, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search owners by name, email, phone, notes..."
        [query]="collection.query()"
        [totalCount]="owners().length"
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
          <table class="w-full min-w-[56rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Owner</th>
                <th class="px-3 py-3">Contact</th>
                <th class="px-3 py-3">Billing</th>
                <th class="px-3 py-3">Properties</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (owner of collection.page(); track owner.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(owner)" (change)="collection.toggle(owner)" />
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-3">
                      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-50 text-sm font-bold text-teal-700">{{ owner.displayName.slice(0, 1) }}</span>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2">
                          <p class="truncate font-bold text-slate-950">{{ owner.displayName }}</p>
                          <p-tag [value]="owner.active ? 'ACTIVE' : 'INACTIVE'" [severity]="owner.active ? 'success' : 'secondary'" />
                        </div>
                        <p class="truncate text-xs text-slate-500">{{ owner.notes || 'No notes' }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-3 text-slate-600">
                    <p>{{ owner.email || 'No email' }}</p>
                    <p class="text-xs text-slate-500">{{ owner.phone || 'No phone' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    @if (owner.billingEmail) {
                      <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Billing ready</span>
                    } @else {
                      <span class="text-xs font-semibold text-amber-700">Missing</span>
                    }
                  </td>
                  <td class="px-3 py-3">
                    <p-tag [value]="owner.propertyCount + ' properties'" severity="info" />
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openOwnerMenu(owner, $event, ownerMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No property owners found.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #ownerMenu [popup]="true" [model]="ownerMenuItems()" appendTo="body" />
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
export class OwnerListComponent {
  owners = input.required<PropertyOwner[]>();
  readonly editOwner = output<PropertyOwner>();
  readonly activateOwner = output<PropertyOwner>();
  readonly deactivateOwner = output<PropertyOwner>();
  readonly deleteOwner = output<PropertyOwner>();
  protected readonly selectedOwner = signal<PropertyOwner | null>(null);
  protected readonly ownerMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<PropertyOwner>(
    this.owners,
    (owner) => owner.id,
    (owner) => [
      owner.displayName,
      owner.email,
      owner.phone,
      owner.billingEmail,
      owner.notes,
      String(owner.propertyCount)
    ].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.displayName.localeCompare(right.displayName) },
      { label: 'Name Z-A', value: 'name-desc', compare: (left, right) => right.displayName.localeCompare(left.displayName) },
      { label: 'Most properties', value: 'properties-desc', compare: (left, right) => right.propertyCount - left.propertyCount },
      { label: 'Fewest properties', value: 'properties-asc', compare: (left, right) => left.propertyCount - right.propertyCount }
    ]
  );

  protected openOwnerMenu(owner: PropertyOwner, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedOwner.set(owner);
    this.ownerMenuItems.set([
      { label: 'Update owner', icon: 'pi pi-pencil', command: () => this.editOwner.emit(owner) },
      { label: 'View properties', icon: 'pi pi-building', disabled: true },
      { separator: true },
      owner.active
        ? { label: 'Deactivate owner', icon: 'pi pi-ban', command: () => this.deactivateOwner.emit(owner) }
        : { label: 'Activate owner', icon: 'pi pi-check-circle', command: () => this.activateOwner.emit(owner) },
      { label: 'Delete owner', icon: 'pi pi-trash', command: () => this.deleteOwner.emit(owner) }
    ]);
    menu.toggle(event);
  }
}
