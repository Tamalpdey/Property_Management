import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import type { CreateServiceCategoryRequest } from '@lorne/contracts';

@Component({
  selector: 'lorne-service-category-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Service category</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">Create category</h2>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Category name</span>
        <input pInputText class="w-full" name="categoryName" required [(ngModel)]="name" />
      </label>
      <button pButton type="submit" class="w-full" icon="pi pi-plus" [loading]="saving()" label="Add category"></button>
    </form>
  `
})
export class ServiceCategoryFormComponent {
  readonly saving = input(false);
  readonly createCategory = output<CreateServiceCategoryRequest>();
  protected name = '';

  submit(): void {
    const name = this.name.trim();
    if (!name || this.saving()) {
      return;
    }
    this.createCategory.emit({ name });
  }

  reset(): void {
    this.name = '';
  }
}
