import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PropertyRecord, ServiceType } from '@lorne/contracts';

@Component({
  selector: 'lorne-property-service-picker',
  standalone: true,
  imports: [CurrencyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Service assignment</p>
          <p class="mt-1 text-sm font-bold text-slate-950">{{ selectedIds().length }} selected</p>
        </div>
        @if (saving()) {
          <span class="rounded-full bg-white px-3 py-1 text-xs font-bold text-teal-700 shadow-sm">Saving</span>
        }
      </div>

      <div class="mt-3 grid gap-2">
        @for (service of serviceTypes(); track service.id) {
          <button
            type="button"
            class="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-bold transition"
            [class.border-teal-300]="isSelected(service.id)"
            [class.bg-white]="isSelected(service.id)"
            [class.text-teal-900]="isSelected(service.id)"
            [class.border-slate-200]="!isSelected(service.id)"
            [class.bg-slate-100]="!isSelected(service.id)"
            [class.text-slate-600]="!isSelected(service.id)"
            [disabled]="saving()"
            (click)="toggle(service.id)"
          >
            <span>
              <span class="block">{{ service.name }}</span>
              <span class="mt-0.5 block text-xs font-semibold text-slate-500">
                {{ service.categoryName || 'General' }} · {{ service.defaultDurationMinutes }} min
                @if (service.basePrice) {
                  · {{ service.basePrice | currency }}
                }
              </span>
            </span>
            <i [class]="isSelected(service.id) ? 'pi pi-check-circle text-teal-700' : 'pi pi-plus-circle text-slate-400'"></i>
          </button>
        } @empty {
          <p class="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">No services in catalog yet.</p>
        }
      </div>
    </div>
  `
})
export class PropertyServicePickerComponent {
  readonly property = input.required<PropertyRecord>();
  readonly serviceTypes = input.required<ServiceType[]>();
  readonly saving = input(false);
  readonly servicesChanged = output<{ propertyId: string; serviceTypeIds: string[] }>();

  protected readonly selectedIds = computed(() => this.property().services.map((service) => service.serviceTypeId));

  protected isSelected(serviceTypeId: string): boolean {
    return this.selectedIds().includes(serviceTypeId);
  }

  protected toggle(serviceTypeId: string): void {
    const selected = new Set(this.selectedIds());
    if (selected.has(serviceTypeId)) {
      selected.delete(serviceTypeId);
    } else {
      selected.add(serviceTypeId);
    }
    this.servicesChanged.emit({ propertyId: this.property().id, serviceTypeIds: [...selected] });
  }
}
