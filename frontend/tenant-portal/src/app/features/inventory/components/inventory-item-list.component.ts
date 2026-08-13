import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { InventoryItem } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

@Component({
  selector: 'lorne-inventory-item-list',
  standalone: true,
  imports: [ButtonModule, DecimalPipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search stock by name, category, unit, location..."
        [query]="collection.query()"
        [totalCount]="items().length"
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
          <table class="w-full min-w-[60rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Item</th>
                <th class="px-3 py-3">Category</th>
                <th class="px-3 py-3">Location</th>
                <th class="px-3 py-3">On hand</th>
                <th class="px-3 py-3">Reorder</th>
                <th class="px-3 py-3">Status</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (item of collection.page(); track item.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(item)" (change)="collection.toggle(item)" />
                  </td>
                  <td class="px-3 py-3 font-bold text-slate-950">{{ item.name }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ item.categoryName || 'Uncategorized' }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ item.storageLocation || 'No location' }}</td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ item.quantityOnHand | number:'1.0-2' }} {{ item.unit }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ item.reorderLevel ?? 0 | number:'1.0-2' }} {{ item.unit }}</td>
                  <td class="px-3 py-3">
                    <p-tag
                      [value]="item.active ? (isLow(item) ? 'Reorder' : 'Ready') : 'Inactive'"
                      [severity]="item.active ? (isLow(item) ? 'warn' : 'success') : 'secondary'"
                    />
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openItemMenu(item, $event, itemMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No inventory items yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #itemMenu [popup]="true" [model]="itemMenuItems()" appendTo="body" />
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
export class InventoryItemListComponent {
  readonly items = input.required<InventoryItem[]>();
  readonly updateItem = output<InventoryItem>();
  readonly adjustStock = output<InventoryItem>();
  readonly updateItemStatus = output<{ item: InventoryItem; active: boolean }>();
  readonly deleteItem = output<InventoryItem>();
  protected readonly selectedItem = signal<InventoryItem | null>(null);
  protected readonly itemMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<InventoryItem>(
    this.items,
    (item) => item.id,
    (item) => [item.name, item.categoryName, item.storageLocation, item.unit, String(item.quantityOnHand), item.reorderLevel?.toString()].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.name.localeCompare(right.name) },
      { label: 'Category A-Z', value: 'category-asc', compare: (left, right) => (left.categoryName ?? '').localeCompare(right.categoryName ?? '') },
      { label: 'Location A-Z', value: 'location-asc', compare: (left, right) => (left.storageLocation ?? '').localeCompare(right.storageLocation ?? '') },
      { label: 'Lowest stock', value: 'stock-asc', compare: (left, right) => left.quantityOnHand - right.quantityOnHand },
      { label: 'Highest stock', value: 'stock-desc', compare: (left, right) => right.quantityOnHand - left.quantityOnHand }
    ]
  );

  protected isLow(item: InventoryItem): boolean {
    return item.reorderLevel !== undefined && item.quantityOnHand <= item.reorderLevel;
  }

  protected openItemMenu(item: InventoryItem, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedItem.set(item);
    this.itemMenuItems.set([
      { label: 'Update item', icon: 'pi pi-pencil', command: () => this.updateItem.emit(item) },
      { label: 'Adjust stock', icon: 'pi pi-plus-circle', command: () => this.adjustStock.emit(item) },
      { separator: true },
      { label: item.active ? 'Deactivate item' : 'Activate item', icon: item.active ? 'pi pi-ban' : 'pi pi-check-circle', command: () => this.updateItemStatus.emit({ item, active: !item.active }) },
      { label: 'Delete item', icon: 'pi pi-trash', styleClass: 'text-red-600', command: () => this.deleteItem.emit(item) }
    ]);
    menu.toggle(event);
  }
}
