import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { CreateServiceTypeRequest, ServiceCategory } from '@lorne/contracts';

@Component({
  selector: 'lorne-service-type-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-amber-700">Service type</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">Create service</h2>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Category</span>
        <select class="w-full border border-slate-300 px-3 py-2" name="categoryId" [(ngModel)]="form.categoryId">
          <option value="">General</option>
          @for (category of categories(); track category.id) {
            <option [value]="category.id">{{ category.name }}</option>
          }
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Service name</span>
        <input pInputText class="w-full" name="serviceName" required [(ngModel)]="form.name" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Description</span>
        <textarea class="w-full border border-slate-300 px-3 py-2" name="description" rows="3" [(ngModel)]="form.description"></textarea>
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Duration</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="duration" suffix=" min" [min]="15" [step]="15" [(ngModel)]="form.defaultDurationMinutes" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Base price</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="basePrice" mode="currency" currency="CAD" locale="en-CA" [min]="0" [(ngModel)]="form.basePrice" />
        </label>
      </div>
      <button pButton type="submit" class="w-full" icon="pi pi-plus" [loading]="saving()" label="Add service"></button>
    </form>
  `
})
export class ServiceTypeFormComponent {
  readonly categories = input.required<ServiceCategory[]>();
  readonly saving = input(false);
  readonly createService = output<CreateServiceTypeRequest>();
  protected form: CreateServiceTypeRequest = this.blankForm();

  submit(): void {
    if (!this.form.name.trim() || this.saving()) {
      return;
    }
    this.createService.emit({
      categoryId: this.form.categoryId || undefined,
      name: this.form.name.trim(),
      description: this.form.description?.trim() || undefined,
      defaultDurationMinutes: this.form.defaultDurationMinutes || undefined,
      basePrice: this.form.basePrice ?? undefined
    });
  }

  reset(): void {
    this.form = this.blankForm();
  }

  private blankForm(): CreateServiceTypeRequest {
    return { categoryId: '', name: '', description: '', defaultDurationMinutes: 60, basePrice: undefined };
  }
}
