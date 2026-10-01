import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import type { CreateServiceTypeRequest, MaintenanceRecordTemplate, ServiceCategory, ServiceType } from '@lorne/contracts';

export const DISABLED_MAINTENANCE_TEMPLATE: MaintenanceRecordTemplate = {
  enabled: false,
  title: 'Maintenance record',
  callTypes: [],
  checks: [],
  measurements: [],
  chemicals: [],
  deliveries: [],
  noteLabel: 'Client note'
};

export const GENERAL_MAINTENANCE_TEMPLATE: MaintenanceRecordTemplate = {
  enabled: true,
  title: 'Service record',
  callTypes: [],
  checks: [],
  measurements: [],
  chemicals: [],
  deliveries: [],
  noteLabel: 'Client note'
};

export const POOL_MAINTENANCE_TEMPLATE: MaintenanceRecordTemplate = {
  enabled: true,
  title: 'Pool maintenance record',
  callTypes: [
    { key: 'maintenance', label: 'Maintenance (1-14)', defaultSelected: true, match: ['pool'] },
    { key: 'chemical', label: 'Chemical Check (3-14)', match: ['chemical', 'chlorine', 'ph'] },
    { key: 'other', label: 'Other' }
  ],
  checks: [
    { key: 'pool_vacuumed', label: 'Pool Vacuumed' },
    { key: 'waterline_cleaned', label: 'Waterline Cleaned' },
    { key: 'pool_skimmed', label: 'Pool Skimmed' },
    { key: 'pool_brushed', label: 'Pool Brushed' },
    { key: 'pump_basket_emptied', label: 'Pump Basket Emptied' },
    { key: 'skimmer_emptied', label: 'Skimmer Emptied' },
    { key: 'filter_backwashed', label: 'Filter Backwashed' },
    { key: 'water_added', label: 'Water Added' },
    { key: 'pool_vac_system_cleaned', label: 'Pool Vac System Cleaned' },
    { key: 'pool_vac_system_tested', label: 'Pool Vac System Tested' },
    { key: 'pool_filter_pressure', label: 'Pool Filter Pressure' },
    { key: 'pool_temperature', label: 'Pool Temperature' },
    { key: 'whirlpool_filter_pressure', label: 'Whirlpool Filter Pressure' },
    { key: 'whirlpool_temperature', label: 'Whirlpool Temperature' }
  ],
  measurements: [
    { key: 'pool_filter_pressure', label: 'Pool Filter Pressure', unit: 'psi' },
    { key: 'pool_temperature', label: 'Pool Temperature', unit: 'F/C' },
    { key: 'whirlpool_filter_pressure', label: 'Whirlpool Filter Pressure', unit: 'psi' },
    { key: 'whirlpool_temperature', label: 'Whirlpool Temperature', unit: 'F/C' }
  ],
  chemicals: [
    { key: 'cl_br', label: 'Cl/Br', unit: 'ppm' },
    { key: 'ph', label: 'pH', unit: 'ppm' },
    { key: 'ta', label: 'TA', unit: 'ppm' },
    { key: 'cal', label: 'CAL', unit: 'ppm' },
    { key: 'stab', label: 'STAB', unit: 'ppm' },
    { key: 'salt', label: 'SALT', unit: 'ppm' },
    { key: 'rate', label: 'RATE', unit: '%' }
  ],
  deliveries: [
    { key: 'liquid_chlorine', label: 'L Liquid Chlorine', inventoryKeywords: ['liquid chlorine'] },
    { key: 'chlorine_tablets', label: '7 kg Chlorine Tablets', inventoryKeywords: ['chlorine tablet'] },
    { key: 'granular_shock', label: '7 kg Granular Shock', inventoryKeywords: ['granular shock'] },
    { key: 'lithium_shock', label: '8 kg Lithium Shock', inventoryKeywords: ['lithium shock'] },
    { key: 'buffer', label: '8 kg Buffer', inventoryKeywords: ['buffer'] },
    { key: 'ph_increaser', label: '3.5 kg pH Increaser', inventoryKeywords: ['ph increaser'] },
    { key: 'msr_sequerian_agent', label: '1 L MSR Sequerian Agent', inventoryKeywords: ['msr'] },
    { key: 'algaecide', label: '1 L 4LG Algaecide', inventoryKeywords: ['algaecide'] },
    { key: 'muriatic_acid', label: '4 L Muriatic Acid', inventoryKeywords: ['muriatic acid'] },
    { key: 'cyanuric_acid', label: '1.75 kg Cyanuric Acid', inventoryKeywords: ['cyanuric acid'] },
    { key: 'pool_salt', label: '20 kg Pool Salt', inventoryKeywords: ['pool salt'] }
  ],
  noteLabel: 'Client note'
};

@Component({
  selector: 'lorne-service-type-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-amber-700">Service type</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">{{ serviceType() ? 'Update service' : 'Create service' }}</h2>
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
      <div class="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Service records are configured once on the selected category, so every service in that category prints the same layout.
      </div>
      <button pButton type="submit" class="w-full" [icon]="serviceType() ? 'pi pi-save' : 'pi pi-plus'" [loading]="saving()" [label]="serviceType() ? 'Save service' : 'Add service'"></button>
    </form>
  `
})
export class ServiceTypeFormComponent {
  readonly categories = input.required<ServiceCategory[]>();
  readonly serviceType = input<ServiceType | null>(null);
  readonly saving = input(false);
  readonly createService = output<CreateServiceTypeRequest>();
  private readonly cdr = inject(ChangeDetectorRef);
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
      basePrice: this.form.basePrice ?? undefined,
      maintenanceRecordTemplate: this.copyTemplate(this.form.maintenanceRecordTemplate)
    });
  }

  reset(): void {
    this.form = this.blankForm();
    this.maintenanceTemplatePreset = 'none';
    this.cdr.detectChanges();
  }

  loadService(serviceType: ServiceType): void {
    this.form = {
      categoryId: serviceType.categoryId || '',
      name: serviceType.name,
      description: serviceType.description || '',
      defaultDurationMinutes: serviceType.defaultDurationMinutes,
      basePrice: serviceType.basePrice,
      maintenanceRecordTemplate: this.copyTemplate(serviceType.maintenanceRecordTemplate)
    };
    this.maintenanceTemplatePreset = this.presetForTemplate(serviceType.maintenanceRecordTemplate);
    this.cdr.detectChanges();
  }

  private blankForm(): CreateServiceTypeRequest {
    return {
      categoryId: '',
      name: '',
      description: '',
      defaultDurationMinutes: 60,
      basePrice: undefined,
      maintenanceRecordTemplate: this.copyTemplate(DISABLED_MAINTENANCE_TEMPLATE)
    };
  }

  protected maintenanceTemplatePreset = 'none';

  protected applyMaintenanceTemplatePreset(preset: string): void {
    this.maintenanceTemplatePreset = preset;
    if (preset === 'pool') {
      this.form.maintenanceRecordTemplate = this.copyTemplate(POOL_MAINTENANCE_TEMPLATE);
      return;
    }
    if (preset === 'general') {
      this.form.maintenanceRecordTemplate = this.copyTemplate(GENERAL_MAINTENANCE_TEMPLATE);
      return;
    }
    this.form.maintenanceRecordTemplate = this.copyTemplate(DISABLED_MAINTENANCE_TEMPLATE);
  }

  protected template(): MaintenanceRecordTemplate {
    if (!this.form.maintenanceRecordTemplate) {
      this.form.maintenanceRecordTemplate = this.copyTemplate(GENERAL_MAINTENANCE_TEMPLATE);
    }
    return this.form.maintenanceRecordTemplate;
  }

  protected setTemplateValue(field: 'title' | 'noteLabel', value: string): void {
    this.form.maintenanceRecordTemplate = { ...this.template(), [field]: value };
  }

  protected lines(items?: Array<{ label: string }>): string {
    return (items ?? []).map((item) => item.label).join('\n');
  }

  protected measurementLines(): string {
    return (this.form.maintenanceRecordTemplate?.measurements ?? [])
      .map((item) => [item.label, item.unit].filter(Boolean).join(' | '))
      .join('\n');
  }

  protected setTemplateLines(kind: 'checks' | 'deliveries', value: string): void {
    const template = this.form.maintenanceRecordTemplate ?? this.copyTemplate(GENERAL_MAINTENANCE_TEMPLATE);
    const rows = value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((label) => ({ key: keyFor(label), label }));
    this.form.maintenanceRecordTemplate = { ...template, [kind]: rows };
  }

  protected setMeasurementLines(value: string): void {
    const template = this.form.maintenanceRecordTemplate ?? this.copyTemplate(GENERAL_MAINTENANCE_TEMPLATE);
    const rows = value.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [label, unit] = line.split('|').map((part) => part.trim());
        return { key: keyFor(label), label, unit: unit || undefined };
      });
    this.form.maintenanceRecordTemplate = { ...template, measurements: rows };
  }

  private presetForTemplate(template?: MaintenanceRecordTemplate): string {
    if (!template?.enabled) {
      return 'none';
    }
    return (template.title || '').toLowerCase().includes('pool') ? 'pool' : 'general';
  }

  private copyTemplate(template?: MaintenanceRecordTemplate): MaintenanceRecordTemplate {
    return JSON.parse(JSON.stringify(template || DISABLED_MAINTENANCE_TEMPLATE)) as MaintenanceRecordTemplate;
  }
}

function keyFor(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'item';
}
