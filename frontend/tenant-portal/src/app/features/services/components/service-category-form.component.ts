import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import type { CreateServiceCategoryRequest, MaintenanceRecordTemplate, ServiceCategory } from '@lorne/contracts';
import { DISABLED_MAINTENANCE_TEMPLATE, GENERAL_MAINTENANCE_TEMPLATE, POOL_MAINTENANCE_TEMPLATE } from './service-type-form.component';

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
        <span class="mb-1 block text-sm font-semibold text-slate-700">Service record template</span>
        <select class="w-full border border-slate-300 px-3 py-2" name="maintenanceTemplatePreset" [(ngModel)]="maintenanceTemplatePreset" (ngModelChange)="applyMaintenanceTemplatePreset($event)">
          <option value="none">No service record</option>
          <option value="general">General service record</option>
          <option value="pool">Pool / chemical service record</option>
        </select>
        <span class="mt-1 block text-xs font-medium text-slate-500">Every service in this category uses this record layout.</span>
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
  protected maintenanceTemplatePreset = 'none';
  private maintenanceRecordTemplate: MaintenanceRecordTemplate = copyTemplate(DISABLED_MAINTENANCE_TEMPLATE);

  submit(): void {
    const name = this.name.trim();
    if (!name || this.saving()) {
      return;
    }
    const wsibRatePercent = this.wsibRatePercent === null || this.wsibRatePercent === undefined || Number.isNaN(Number(this.wsibRatePercent))
      ? null
      : Number(this.wsibRatePercent);
    this.saveCategory.emit({ name, wsibRatePercent, maintenanceRecordTemplate: copyTemplate(this.maintenanceRecordTemplate) });
  }

  loadCategory(category: ServiceCategory): void {
    this.name = category.name;
    this.wsibRatePercent = category.wsibRatePercent ?? null;
    this.maintenanceRecordTemplate = copyTemplate(category.maintenanceRecordTemplate || DISABLED_MAINTENANCE_TEMPLATE);
    this.maintenanceTemplatePreset = presetForTemplate(this.maintenanceRecordTemplate);
    this.editing = true;
    this.changeDetectorRef.markForCheck();
  }

  reset(): void {
    this.name = '';
    this.wsibRatePercent = null;
    this.maintenanceRecordTemplate = copyTemplate(DISABLED_MAINTENANCE_TEMPLATE);
    this.maintenanceTemplatePreset = 'none';
    this.editing = false;
    this.changeDetectorRef.markForCheck();
  }

  protected applyMaintenanceTemplatePreset(preset: string): void {
    this.maintenanceTemplatePreset = preset;
    this.maintenanceRecordTemplate = copyTemplate(
      preset === 'pool' ? POOL_MAINTENANCE_TEMPLATE : preset === 'general' ? GENERAL_MAINTENANCE_TEMPLATE : DISABLED_MAINTENANCE_TEMPLATE
    );
  }
}

function presetForTemplate(template?: MaintenanceRecordTemplate): string {
  if (!template?.enabled) {
    return 'none';
  }
  return (template.title || '').toLowerCase().includes('pool') ? 'pool' : 'general';
}

function copyTemplate(template: MaintenanceRecordTemplate): MaintenanceRecordTemplate {
  return JSON.parse(JSON.stringify(template)) as MaintenanceRecordTemplate;
}
