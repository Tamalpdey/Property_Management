import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { AssetCatalog, CreateAssetRequest, CreateInventoryCategoryRequest, CreateInventoryItemRequest, InventoryCatalog } from '@lorne/contracts';
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
  imports: [AssetFormComponent, ButtonModule, DialogModule, InventoryCategoryFormComponent, InventoryItemFormComponent, InventoryStockPanelComponent, TagModule, ToolsEquipmentPanelComponent],
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
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <div class="space-y-2">
          @if (inventory(); as stock) {
            <lorne-inventory-stock-panel
              [catalog]="stock"
              (addItem)="showItemDialog.set(true)"
              (addCategory)="showCategoryDialog.set(true)"
            />
          }

          @if (assets(); as assetData) {
            <lorne-tools-equipment-panel
              [catalog]="assetData"
              (addAsset)="showAssetDialog.set(true)"
            />
          }
      </div>

      <p-dialog header="Add inventory category" [modal]="true" [visible]="showCategoryDialog()" [style]="{ width: 'min(34rem, 92vw)' }" (visibleChange)="showCategoryDialog.set($event)">
        <lorne-inventory-category-form [saving]="savingCategory()" (createCategory)="createCategory($event)" />
      </p-dialog>

      <p-dialog header="Add stock item" [modal]="true" [visible]="showItemDialog()" [style]="{ width: 'min(42rem, 92vw)' }" (visibleChange)="showItemDialog.set($event)">
        @if (inventory(); as stock) {
          <lorne-inventory-item-form [categories]="stock.categories" [saving]="savingItem()" (createItem)="createItem($event)" />
        }
      </p-dialog>

      <p-dialog header="Add equipment" [modal]="true" [visible]="showAssetDialog()" [style]="{ width: 'min(42rem, 92vw)' }" (visibleChange)="showAssetDialog.set($event)">
        @if (assets(); as assetData) {
          <lorne-asset-form [workers]="assetData.workers" [saving]="savingAsset()" (createAsset)="createAsset($event)" />
        }
      </p-dialog>
    </section>
  `
})
export class InventoryPageComponent {
  private readonly inventoryService = inject(InventoryService);
  private readonly assetService = inject(AssetService);
  @ViewChild(InventoryCategoryFormComponent) private categoryForm?: InventoryCategoryFormComponent;
  @ViewChild(InventoryItemFormComponent) private itemForm?: InventoryItemFormComponent;
  @ViewChild(AssetFormComponent) private assetForm?: AssetFormComponent;

  protected readonly inventory = signal<InventoryCatalog | null>(null);
  protected readonly assets = signal<AssetCatalog | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingItem = signal(false);
  protected readonly savingAsset = signal(false);
  protected readonly error = signal('');
  protected readonly showCategoryDialog = signal(false);
  protected readonly showItemDialog = signal(false);
  protected readonly showAssetDialog = signal(false);

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

  async createItem(request: CreateInventoryItemRequest): Promise<void> {
    this.savingItem.set(true);
    this.error.set('');
    try {
      const item = await firstValueFrom(this.inventoryService.createItem(request));
      this.inventory.update((inventory) => inventory ? { ...inventory, items: [...inventory.items, item].sort((a, b) => a.name.localeCompare(b.name)) } : inventory);
      this.itemForm?.reset();
      this.showItemDialog.set(false);
    } catch {
      this.error.set('Unable to create inventory item. Check required fields or backend status.');
    } finally {
      this.savingItem.set(false);
    }
  }

  async createAsset(request: CreateAssetRequest): Promise<void> {
    this.savingAsset.set(true);
    this.error.set('');
    try {
      const asset = await firstValueFrom(this.assetService.create(request));
      this.assets.update((assets) => assets ? { ...assets, assets: [...assets.assets, asset].sort((a, b) => a.name.localeCompare(b.name)) } : assets);
      this.assetForm?.reset();
      this.showAssetDialog.set(false);
    } catch {
      this.error.set('Unable to create equipment. Check worker assignment or backend status.');
    } finally {
      this.savingAsset.set(false);
    }
  }
}
