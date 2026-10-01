import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import type { AssetCatalog, CreateAssetRequest, CreateInventoryCategoryRequest, CreateInventoryItemRequest, InventoryCatalog, InventoryItem, TenantAsset } from '@lorne/contracts';
import { AssetFormComponent } from './components/asset-form.component';
import { InventoryCategoryFormComponent } from './components/inventory-category-form.component';
import { InventoryItemFormComponent } from './components/inventory-item-form.component';
import { InventoryStockPanelComponent } from './components/inventory-stock-panel.component';
import { ToolsEquipmentPanelComponent } from './components/tools-equipment-panel.component';
import { AssetService } from './services/asset.service';
import { InventoryService } from './services/inventory.service';

@Component({
  selector: 'lorne-inventory-page',
  standalone: true,
  imports: [AssetFormComponent, ButtonModule, DialogModule, FormsModule, InputNumberModule, InventoryCategoryFormComponent, InventoryItemFormComponent, InventoryStockPanelComponent, TagModule, ToolsEquipmentPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Inventory" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Inventory and equipment</h1>
            @if (inventory(); as stock) {
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ stock.items.length }} stock</span>
            }
            @if (assets(); as assetData) {
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ assetData.assets.length }} equipment</span>
            }
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" icon="pi pi-upload" severity="secondary" label="Import" (click)="showImportNotice()"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (importNotice()) {
        <p class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{{ importNotice() }}</p>
      }

      <div class="space-y-2">
          @if (inventory(); as stock) {
            <lorne-inventory-stock-panel
              [catalog]="stock"
              (addItem)="openCreateItem()"
              (addCategory)="showCategoryDialog.set(true)"
              (updateItem)="openEditItem($event)"
              (adjustStock)="openAdjustStock($event)"
              (updateItemStatus)="updateItemStatus($event.item, $event.active)"
              (deleteItem)="deleteItem($event)"
            />
          }

          @if (assets(); as assetData) {
            <lorne-tools-equipment-panel
              [catalog]="assetData"
              (addAsset)="openCreateAsset()"
              (updateAsset)="openEditAsset($event)"
              (assignWorker)="openEditAsset($event)"
              (updateAssetStatus)="updateAssetStatus($event.asset, $event.active)"
              (deleteAsset)="deleteAsset($event)"
            />
          }
      </div>

      <p-dialog header="Add inventory category" [modal]="true" [visible]="showCategoryDialog()" [style]="{ width: 'min(34rem, 92vw)' }" (visibleChange)="showCategoryDialog.set($event)">
        <lorne-inventory-category-form [saving]="savingCategory()" (createCategory)="createCategory($event)" />
      </p-dialog>

      <p-dialog [header]="editingItem() ? 'Update stock item' : 'Add stock item'" [modal]="true" [visible]="showItemDialog()" [style]="{ width: 'min(42rem, 92vw)' }" (visibleChange)="onItemDialogVisible($event)">
        @if (inventory(); as stock) {
          <lorne-inventory-item-form [categories]="stock.categories" [item]="editingItem()" [saving]="savingItem()" (createItem)="saveItem($event)" />
        }
      </p-dialog>

      <p-dialog header="Adjust stock" [modal]="true" [visible]="showStockAdjustDialog()" [style]="{ width: 'min(32rem, 92vw)' }" (visibleChange)="onStockAdjustVisible($event)">
        @if (adjustingItem(); as item) {
          <div class="space-y-4">
            <div>
              <p class="text-xs font-bold uppercase tracking-wide text-blue-700">Stock count</p>
              <h2 class="mt-1 text-xl font-bold text-slate-950">{{ item.name }}</h2>
              <p class="text-sm font-semibold text-slate-500">{{ item.categoryName || 'Uncategorized' }} · {{ item.storageLocation || 'No location' }}</p>
            </div>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Quantity on hand</span>
              <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="adjustQuantity" [min]="0" [minFractionDigits]="0" [maxFractionDigits]="2" [(ngModel)]="adjustedQuantity" />
            </label>
            <button pButton type="button" class="w-full" icon="pi pi-save" [loading]="savingStockAdjustment()" label="Save stock count" (click)="saveStockAdjustment()"></button>
          </div>
        }
      </p-dialog>

      <p-dialog [header]="editingAsset() ? 'Update equipment' : 'Add equipment'" [modal]="true" [visible]="showAssetDialog()" [style]="{ width: 'min(42rem, 92vw)' }" (visibleChange)="onAssetDialogVisible($event)">
        @if (assets(); as assetData) {
          <lorne-asset-form [workers]="assetData.workers" [asset]="editingAsset()" [saving]="savingAsset()" (createAsset)="saveAsset($event)" />
        }
      </p-dialog>
    </section>
  `
})
export class InventoryPageComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly assetService = inject(AssetService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  @ViewChild(InventoryCategoryFormComponent) private categoryForm?: InventoryCategoryFormComponent;
  @ViewChild(InventoryItemFormComponent) private itemForm?: InventoryItemFormComponent;
  @ViewChild(AssetFormComponent) private assetForm?: AssetFormComponent;

  protected readonly inventory = signal<InventoryCatalog | null>(null);
  protected readonly assets = signal<AssetCatalog | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingItem = signal(false);
  protected readonly savingAsset = signal(false);
  protected readonly savingStockAdjustment = signal(false);
  protected readonly error = signal('');
  protected readonly importNotice = signal('');
  protected readonly showCategoryDialog = signal(false);
  protected readonly showItemDialog = signal(false);
  protected readonly showAssetDialog = signal(false);
  protected readonly showStockAdjustDialog = signal(false);
  protected readonly editingItem = signal<InventoryItem | null>(null);
  protected readonly editingAsset = signal<TenantAsset | null>(null);
  protected readonly adjustingItem = signal<InventoryItem | null>(null);
  protected adjustedQuantity = 0;

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [inventory, assets] = await Promise.all([
      firstValueFrom(this.inventoryService.catalog()),
      firstValueFrom(this.assetService.catalog())
    ]);
    this.inventory.set(inventory);
    this.assets.set(assets);
    this.openAssignmentDialogFromRoute();
  }

  async createCategory(request: CreateInventoryCategoryRequest): Promise<void> {
    this.savingCategory.set(true);
    this.error.set('');
    try {
      const category = await firstValueFrom(this.inventoryService.createCategory(request));
      this.inventory.update((inventory) => inventory ? { ...inventory, categories: [...inventory.categories, category].sort((a, b) => a.name.localeCompare(b.name)) } : inventory);
      this.categoryForm?.reset();
      this.showCategoryDialog.set(false);
    } catch {
      this.error.set('Unable to create inventory category. Check for duplicate names or backend status.');
    } finally {
      this.savingCategory.set(false);
    }
  }

  openCreateItem(): void {
    this.editingItem.set(null);
    this.itemForm?.reset();
    this.showItemDialog.set(true);
  }

  showImportNotice(): void {
    this.error.set('');
    this.importNotice.set('Inventory and equipment import is ready for the toolbar; CSV mapping and backend import processing will be wired as the next import slice.');
  }

  openEditItem(item: InventoryItem): void {
    this.editingItem.set(item);
    this.showItemDialog.set(true);
    setTimeout(() => this.itemForm?.loadItem(item));
  }

  async saveItem(request: CreateInventoryItemRequest): Promise<void> {
    this.savingItem.set(true);
    this.error.set('');
    try {
      const editing = this.editingItem();
      const item = editing
        ? await firstValueFrom(this.inventoryService.updateItem(editing.id, request))
        : await firstValueFrom(this.inventoryService.createItem(request));
      this.upsertInventoryItem(item);
      this.itemForm?.reset();
      this.editingItem.set(null);
      this.showItemDialog.set(false);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to save inventory item. Check required fields or backend status.'));
    } finally {
      this.savingItem.set(false);
    }
  }

  openAdjustStock(item: InventoryItem): void {
    this.adjustingItem.set(item);
    this.adjustedQuantity = item.quantityOnHand;
    this.showStockAdjustDialog.set(true);
  }

  async saveStockAdjustment(): Promise<void> {
    const item = this.adjustingItem();
    if (!item) {
      return;
    }
    this.savingStockAdjustment.set(true);
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.inventoryService.updateItem(item.id, {
        categoryId: item.categoryId,
        name: item.name,
        unit: item.unit,
        unitCost: item.unitCost,
        billingCost: item.billingCost,
        quantityOnHand: this.adjustedQuantity ?? 0,
        reorderLevel: item.reorderLevel,
        storageLocation: item.storageLocation
      }));
      this.upsertInventoryItem(updated);
      this.adjustingItem.set(null);
      this.showStockAdjustDialog.set(false);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to adjust stock count.'));
    } finally {
      this.savingStockAdjustment.set(false);
    }
  }

  async updateItemStatus(item: InventoryItem, active: boolean): Promise<void> {
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.inventoryService.updateItemStatus(item.id, { active }));
      this.upsertInventoryItem(updated);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to update inventory item status.'));
    }
  }

  async deleteItem(item: InventoryItem): Promise<void> {
    if (!window.confirm(`Delete ${item.name}? Items with work order history must be deactivated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.inventoryService.deleteItem(item.id));
      this.inventory.update((inventory) => inventory ? { ...inventory, items: inventory.items.filter((current) => current.id !== item.id) } : inventory);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to delete inventory item. Deactivate it if it has work order history.'));
    }
  }

  openCreateAsset(): void {
    this.editingAsset.set(null);
    this.assetForm?.reset();
    this.showAssetDialog.set(true);
  }

  openEditAsset(asset: TenantAsset): void {
    this.editingAsset.set(asset);
    this.showAssetDialog.set(true);
    setTimeout(() => this.assetForm?.loadAsset(asset));
  }

  async saveAsset(request: CreateAssetRequest): Promise<void> {
    this.savingAsset.set(true);
    this.error.set('');
    try {
      const editing = this.editingAsset();
      const asset = editing
        ? await firstValueFrom(this.assetService.update(editing.id, request))
        : await firstValueFrom(this.assetService.create(request));
      this.upsertAsset(asset);
      this.assetForm?.reset();
      this.editingAsset.set(null);
      this.showAssetDialog.set(false);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to save equipment. Check worker assignment or backend status.'));
    } finally {
      this.savingAsset.set(false);
    }
  }

  async updateAssetStatus(asset: TenantAsset, active: boolean): Promise<void> {
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.assetService.updateStatus(asset.id, { active }));
      this.upsertAsset(updated);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to update equipment status.'));
    }
  }

  async deleteAsset(asset: TenantAsset): Promise<void> {
    if (!window.confirm(`Delete ${asset.name}? Equipment with assignments or work order history must be deactivated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.assetService.delete(asset.id));
      this.assets.update((assets) => assets ? { ...assets, assets: assets.assets.filter((current) => current.id !== asset.id) } : assets);
    } catch (error) {
      this.error.set(this.apiErrorMessage(error, 'Unable to delete equipment. Deactivate or unassign it if it has history.'));
    }
  }

  onItemDialogVisible(visible: boolean): void {
    this.showItemDialog.set(visible);
    if (!visible) {
      this.editingItem.set(null);
    }
  }

  onAssetDialogVisible(visible: boolean): void {
    this.showAssetDialog.set(visible);
    if (!visible) {
      this.editingAsset.set(null);
    }
  }

  onStockAdjustVisible(visible: boolean): void {
    this.showStockAdjustDialog.set(visible);
    if (!visible) {
      this.adjustingItem.set(null);
    }
  }

  private openAssignmentDialogFromRoute(): void {
    const assignedWorkerId = this.route.snapshot.queryParamMap.get('assignedWorkerId');
    if (!assignedWorkerId) {
      return;
    }
    this.openCreateAsset();
    setTimeout(() => this.assetForm?.selectWorker(assignedWorkerId));
    void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
  }

  private upsertInventoryItem(item: InventoryItem): void {
    this.inventory.update((inventory) => inventory ? {
      ...inventory,
      items: [...inventory.items.filter((current) => current.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name))
    } : inventory);
  }

  private upsertAsset(asset: TenantAsset): void {
    this.assets.update((assets) => assets ? {
      ...assets,
      assets: [...assets.assets.filter((current) => current.id !== asset.id), asset].sort((a, b) => a.name.localeCompare(b.name))
    } : assets);
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    const response = error as { error?: { error?: { message?: string }; message?: string } };
    return response.error?.error?.message || response.error?.message || fallback;
  }
}
