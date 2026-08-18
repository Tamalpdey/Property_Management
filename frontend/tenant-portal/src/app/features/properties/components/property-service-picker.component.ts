import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PropertyRecord, ServiceType } from '@lorne/contracts';

type ServicePickerViewMode = 'GROUPED' | 'FLAT';
type ServicePickerDisplayRow =
  | { type: 'category'; id: string; label: string; count: number }
  | { type: 'service'; id: string; service: ServiceType };

@Component({
  selector: 'lorne-property-service-picker',
  standalone: true,
  imports: [CurrencyPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-slate-500">Service assignment</p>
          <p class="mt-1 text-sm font-bold text-slate-950">{{ selectedIds().length }} selected</p>
        </div>
        <div class="grid gap-2 md:grid-cols-[14rem_12rem_auto_auto] md:items-center">
          <input
            class="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            type="search"
            [ngModel]="searchText()"
            (ngModelChange)="searchText.set($event)"
            placeholder="Search services..."
          />
          <select
            class="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            [ngModel]="categoryFilter()"
            (ngModelChange)="categoryFilter.set($event)"
          >
            <option value="ALL">All categories</option>
            @for (category of categories(); track category) {
              <option [value]="category">{{ category }}</option>
            }
          </select>
          <div class="flex h-10 rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              class="rounded-md px-3 text-xs font-black transition"
              [class.bg-teal-600]="viewMode() === 'GROUPED'"
              [class.text-white]="viewMode() === 'GROUPED'"
              [class.text-slate-500]="viewMode() !== 'GROUPED'"
              (click)="viewMode.set('GROUPED')"
            >
              Grouped
            </button>
            <button
              type="button"
              class="rounded-md px-3 text-xs font-black transition"
              [class.bg-teal-600]="viewMode() === 'FLAT'"
              [class.text-white]="viewMode() === 'FLAT'"
              [class.text-slate-500]="viewMode() !== 'FLAT'"
              (click)="viewMode.set('FLAT')"
            >
              Flat
            </button>
          </div>
          @if (saving()) {
            <span class="rounded-full bg-white px-3 py-2 text-xs font-bold text-teal-700 shadow-sm">Saving</span>
          }
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <button
          type="button"
          class="rounded-lg bg-teal-600 px-3 py-2 text-xs font-black text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="saving() || filteredServiceTypes().length === 0"
          (click)="addShown()"
        >
          Add shown
        </button>
        <button
          type="button"
          class="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="saving() || serviceTypes().length === 0"
          (click)="selectAll()"
        >
          Select all
        </button>
        <button
          type="button"
          class="rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="saving() || filteredServiceTypes().length === 0"
          (click)="clearShown()"
        >
          Clear shown
        </button>
        <span class="text-xs font-semibold text-slate-500">
          {{ filteredServiceTypes().length }} shown
        </span>
      </div>

      <div class="mt-3 grid gap-2">
        @for (row of displayRows(); track row.id) {
          @if (row.type === 'category') {
            <div class="mt-1 flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
              <span>{{ row.label }}</span>
              <span>{{ row.count }} services</span>
            </div>
          } @else {
            <button
              type="button"
              class="flex min-h-12 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm font-bold transition"
              [class.border-teal-400]="isSelected(row.service.id)"
              [class.bg-teal-50]="isSelected(row.service.id)"
              [class.text-teal-900]="isSelected(row.service.id)"
              [class.border-slate-200]="!isSelected(row.service.id)"
              [class.bg-slate-100]="!isSelected(row.service.id)"
              [class.text-slate-600]="!isSelected(row.service.id)"
              [disabled]="saving()"
              (click)="toggle(row.service.id)"
            >
              <span>
                <span class="block">{{ row.service.name }}</span>
                <span class="mt-0.5 block text-xs font-semibold text-slate-500">
                  {{ row.service.categoryName || 'General' }} · {{ row.service.defaultDurationMinutes }} min
                  @if (row.service.basePrice) {
                    · {{ row.service.basePrice | currency }}
                  }
                </span>
              </span>
              <span
                class="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm"
                [class.border-teal-500]="isSelected(row.service.id)"
                [class.bg-teal-600]="isSelected(row.service.id)"
                [class.text-white]="isSelected(row.service.id)"
                [class.border-slate-300]="!isSelected(row.service.id)"
                [class.bg-white]="!isSelected(row.service.id)"
                [class.text-slate-400]="!isSelected(row.service.id)"
              >
                <i [class]="isSelected(row.service.id) ? 'pi pi-check' : 'pi pi-plus'"></i>
              </span>
            </button>
          }
        } @empty {
          <p class="rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">No matching services.</p>
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

  protected readonly searchText = signal('');
  protected readonly categoryFilter = signal('ALL');
  protected readonly viewMode = signal<ServicePickerViewMode>('GROUPED');
  private readonly pendingSelection = signal<{ propertyId: string; serviceTypeIds: string[] } | null>(null);

  protected readonly selectedIds = computed(() => {
    const property = this.property();
    const pending = this.pendingSelection();
    return pending?.propertyId === property.id ? pending.serviceTypeIds : property.services.map((service) => service.serviceTypeId);
  });

  protected readonly categories = computed(() => {
    const categories = new Set<string>();
    this.serviceTypes().forEach((service) => categories.add(service.categoryName || 'General'));
    return [...categories].sort((left, right) => left.localeCompare(right));
  });

  protected readonly filteredServiceTypes = computed(() => {
    const query = this.searchText().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.serviceTypes()
      .filter((service) => category === 'ALL' || (service.categoryName || 'General') === category)
      .filter((service) => {
        if (!query) {
          return true;
        }
        return [service.name, service.categoryName || 'General', service.description || '']
          .join(' ')
          .toLowerCase()
          .includes(query);
      });
  });

  protected readonly displayRows = computed<ServicePickerDisplayRow[]>(() => {
    const services = this.filteredServiceTypes();
    if (this.viewMode() === 'FLAT') {
      return services.map((service) => ({ type: 'service', id: service.id, service }));
    }

    const rows: ServicePickerDisplayRow[] = [];
    const grouped = new Map<string, ServiceType[]>();
    services.forEach((service) => {
      const category = service.categoryName || 'General';
      grouped.set(category, [...(grouped.get(category) ?? []), service]);
    });

    [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .forEach(([category, categoryServices]) => {
        rows.push({ type: 'category', id: `category-${category}`, label: category, count: categoryServices.length });
        categoryServices.forEach((service) => rows.push({ type: 'service', id: service.id, service }));
      });
    return rows;
  });

  constructor() {
    effect(() => {
      const property = this.property();
      const pending = this.pendingSelection();
      if (pending?.propertyId !== property.id) {
        return;
      }

      const savedIds = property.services.map((service) => service.serviceTypeId);
      if (sameIds(savedIds, pending.serviceTypeIds)) {
        this.pendingSelection.set(null);
      }
    });
  }

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
    this.emitSelection([...selected]);
  }

  protected addShown(): void {
    const selected = new Set(this.selectedIds());
    this.filteredServiceTypes().forEach((service) => selected.add(service.id));
    this.emitSelection([...selected]);
  }

  protected selectAll(): void {
    this.emitSelection(this.serviceTypes().map((service) => service.id));
  }

  protected clearShown(): void {
    const shownIds = new Set(this.filteredServiceTypes().map((service) => service.id));
    this.emitSelection(this.selectedIds().filter((id) => !shownIds.has(id)));
  }

  private emitSelection(serviceTypeIds: string[]): void {
    const propertyId = this.property().id;
    this.pendingSelection.set({ propertyId, serviceTypeIds });
    this.servicesChanged.emit({ propertyId, serviceTypeIds });
  }
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftSet = new Set(left);
  return right.every((id) => leftSet.has(id));
}
