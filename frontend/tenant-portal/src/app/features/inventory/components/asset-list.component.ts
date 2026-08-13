import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { TenantAsset } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

@Component({
  selector: 'lorne-asset-list',
  standalone: true,
  imports: [ButtonModule, DecimalPipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search equipment by name, type, identifier, location, worker..."
        [query]="collection.query()"
        [totalCount]="assets().length"
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
          <table class="w-full min-w-[64rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Equipment</th>
                <th class="px-3 py-3">Type</th>
                <th class="px-3 py-3">Identifier</th>
                <th class="px-3 py-3">Location</th>
                <th class="px-3 py-3">Qty</th>
                <th class="px-3 py-3">Worker</th>
                <th class="px-3 py-3">Status</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (asset of collection.page(); track asset.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(asset)" (change)="collection.toggle(asset)" />
                  </td>
                  <td class="px-3 py-3 font-bold text-slate-950">{{ asset.name }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ asset.assetType }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ asset.identifier || 'No identifier' }}</td>
                  <td class="px-3 py-3 text-slate-600">{{ asset.storageLocation || 'No location' }}</td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ asset.quantityOnHand | number:'1.0-2' }}</td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ asset.assignedWorkerName || 'Unassigned' }}</td>
                  <td class="px-3 py-3">
                    <p-tag
                      [value]="asset.active ? (asset.assignedWorkerName ? 'Assigned' : 'Available') : 'Inactive'"
                      [severity]="asset.active ? (asset.assignedWorkerName ? 'info' : 'success') : 'secondary'"
                    />
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openAssetMenu(asset, $event, assetMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="9" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No tools or equipment yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #assetMenu [popup]="true" [model]="assetMenuItems()" appendTo="body" />
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
export class AssetListComponent {
  readonly assets = input.required<TenantAsset[]>();
  readonly updateAsset = output<TenantAsset>();
  readonly assignWorker = output<TenantAsset>();
  readonly updateAssetStatus = output<{ asset: TenantAsset; active: boolean }>();
  readonly deleteAsset = output<TenantAsset>();
  protected readonly selectedAsset = signal<TenantAsset | null>(null);
  protected readonly assetMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<TenantAsset>(
    this.assets,
    (asset) => asset.id,
    (asset) => [asset.name, asset.assetType, asset.identifier, asset.storageLocation, asset.quantityOnHand.toString(), asset.assignedWorkerName, asset.active ? 'active' : 'inactive'].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.name.localeCompare(right.name) },
      { label: 'Type A-Z', value: 'type-asc', compare: (left, right) => left.assetType.localeCompare(right.assetType) },
      { label: 'Location A-Z', value: 'location-asc', compare: (left, right) => (left.storageLocation ?? '').localeCompare(right.storageLocation ?? '') },
      { label: 'Lowest qty', value: 'qty-asc', compare: (left, right) => left.quantityOnHand - right.quantityOnHand },
      { label: 'Assigned first', value: 'assigned-desc', compare: (left, right) => Number(Boolean(right.assignedWorkerName)) - Number(Boolean(left.assignedWorkerName)) },
      { label: 'Available first', value: 'assigned-asc', compare: (left, right) => Number(Boolean(left.assignedWorkerName)) - Number(Boolean(right.assignedWorkerName)) }
    ]
  );

  protected openAssetMenu(asset: TenantAsset, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedAsset.set(asset);
    this.assetMenuItems.set([
      { label: 'Update equipment', icon: 'pi pi-pencil', command: () => this.updateAsset.emit(asset) },
      { label: asset.assignedWorkerId ? 'Change assignment' : 'Assign worker', icon: 'pi pi-user-plus', command: () => this.assignWorker.emit(asset) },
      { separator: true },
      { label: asset.active ? 'Deactivate equipment' : 'Activate equipment', icon: asset.active ? 'pi pi-ban' : 'pi pi-check-circle', command: () => this.updateAssetStatus.emit({ asset, active: !asset.active }) },
      { label: 'Delete equipment', icon: 'pi pi-trash', styleClass: 'text-red-600', command: () => this.deleteAsset.emit(asset) }
    ]);
    menu.toggle(event);
  }
}
