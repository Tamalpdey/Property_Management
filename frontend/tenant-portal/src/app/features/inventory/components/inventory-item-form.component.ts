import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import type { CreateInventoryItemRequest, InventoryCategory, InventoryItem } from '@lorne/contracts';

@Component({
  selector: 'lorne-inventory-item-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-blue-700">Consumable product</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">{{ item() ? 'Update stock item' : 'Add stock item' }}</h2>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Category</span>
        <select class="w-full border border-slate-300 px-3 py-2" name="categoryId" [(ngModel)]="form.categoryId">
          <option value="">Uncategorized</option>
          @for (category of categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Item name</span>
        <input pInputText class="w-full" name="itemName" required [(ngModel)]="form.name" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Location</span>
        <input pInputText class="w-full" name="storageLocation" placeholder="Warehouse, van, shelf..." [(ngModel)]="form.storageLocation" />
      </label>
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Unit</span>
          <input pInputText class="w-full" name="unit" required [(ngModel)]="form.unit" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Purchase cost</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="unitCost" [min]="0" mode="currency" currency="CAD" [(ngModel)]="form.unitCost" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Billing cost</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="billingCost" [min]="0" mode="currency" currency="CAD" [(ngModel)]="form.billingCost" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">On hand</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="quantity" [min]="0" [minFractionDigits]="0" [maxFractionDigits]="2" [(ngModel)]="form.quantityOnHand" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Reorder</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="reorderLevel" [min]="0" [minFractionDigits]="0" [maxFractionDigits]="2" [(ngModel)]="form.reorderLevel" />
        </label>
      </div>
      <button pButton type="submit" class="w-full" [icon]="item() ? 'pi pi-save' : 'pi pi-plus'" [loading]="saving()" [label]="item() ? 'Update item' : 'Add item'"></button>
    </form>
  `
})
export class InventoryItemFormComponent {
  readonly categories = input.required<InventoryCategory[]>();
  readonly item = input<InventoryItem | null>(null);
  readonly saving = input(false);
  readonly createItem = output<CreateInventoryItemRequest>();
  protected form: CreateInventoryItemRequest = this.blankForm();

  submit(): void {
    if (!this.form.name.trim() || !this.form.unit.trim() || this.saving()) {
      return;
    }
    this.createItem.emit({
      categoryId: this.form.categoryId || undefined,
      name: this.form.name.trim(),
      unit: this.form.unit.trim(),
      unitCost: this.form.unitCost ?? undefined,
      billingCost: this.form.billingCost ?? undefined,
      quantityOnHand: this.form.quantityOnHand ?? 0,
      reorderLevel: this.form.reorderLevel ?? undefined,
      storageLocation: this.form.storageLocation?.trim() || undefined
    });
  }

  reset(): void {
    this.form = this.blankForm();
  }

  loadItem(item: InventoryItem): void {
    this.form = {
      categoryId: item.categoryId ?? '',
      name: item.name,
      unit: item.unit,
      unitCost: item.unitCost,
      billingCost: item.billingCost,
      quantityOnHand: item.quantityOnHand,
      reorderLevel: item.reorderLevel,
      storageLocation: item.storageLocation ?? ''
    };
  }

  private blankForm(): CreateInventoryItemRequest {
    return { categoryId: '', name: '', unit: 'each', unitCost: undefined, billingCost: undefined, quantityOnHand: 0, reorderLevel: undefined, storageLocation: '' };
  }
}
