import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { InventoryCatalog } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InventoryItemListComponent } from './inventory-item-list.component';

@Component({
  selector: 'lorne-inventory-stock-panel',
  standalone: true,
  imports: [ButtonModule, InventoryItemListComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-2">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Inventory" severity="info" />
            <h2 class="text-lg font-bold text-slate-950">Consumable stock</h2>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ catalog().items.length }} items</span>
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" icon="pi pi-plus" label="Add stock" (click)="addItem.emit()"></button>
            <button pButton type="button" icon="pi pi-folder-plus" severity="secondary" label="Add category" (click)="addCategory.emit()"></button>
          </div>
        </div>
      </div>
      <lorne-inventory-item-list [items]="catalog().items" />
    </section>
  `
})
export class InventoryStockPanelComponent {
  readonly catalog = input.required<InventoryCatalog>();
  readonly addItem = output<void>();
  readonly addCategory = output<void>();
}
