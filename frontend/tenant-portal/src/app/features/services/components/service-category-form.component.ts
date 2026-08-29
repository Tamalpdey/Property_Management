import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import type { CreateServiceCategoryRequest, ServiceCategory } from '@lorne/contracts';

@Component({
  selector: 'lorne-service-category-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Service category</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">{{ editing ? 'Update category' : 'Create category' }}</h2>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Category name</span>
        <input pInputText class="w-full" name="categoryName" required [(ngModel)]="name" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">WSIB rate %</span>
        <input
          pInputText
          class="w-full"
          name="wsibRatePercent"
          type="number"
          min="0"
          step="0.0001"
          [(ngModel)]="wsibRatePercent"
          placeholder="Example: 2.35"
        />
      </label>
      <div class="flex gap-2">
        <button
          pButton
          type="submit"
          class="flex-1"
          [icon]="editing ? 'pi pi-save' : 'pi pi-plus'"
          [loading]="saving()"
          [label]="editing ? 'Save category' : 'Add category'"
        ></button>
        @if (editing) {
          <button pButton type="button" severity="secondary" icon="pi pi-times" label="Cancel" (click)="reset()"></button>
        }
      </div>
    </form>
  `
})
export class ServiceCategoryFormComponent {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  readonly saving = input(false);
  readonly saveCategory = output<CreateServiceCategoryRequest>();
  protected name = '';
  protected wsibRatePercent: number | null = null;
  protected editing = false;

  submit(): void {
    const name = this.name.trim();
    if (!name || this.saving()) {
      return;
    }
    const wsibRatePercent = this.wsibRatePercent === null || this.wsibRatePercent === undefined || Number.isNaN(Number(this.wsibRatePercent))
      ? null
      : Number(this.wsibRatePercent);
    this.saveCategory.emit({ name, wsibRatePercent });
  }

  loadCategory(category: ServiceCategory): void {
    this.name = category.name;
    this.wsibRatePercent = category.wsibRatePercent ?? null;
    this.editing = true;
    this.changeDetectorRef.markForCheck();
  }

  reset(): void {
    this.name = '';
    this.wsibRatePercent = null;
    this.editing = false;
    this.changeDetectorRef.markForCheck();
  }
}
