import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { ServiceCatalog, ServiceType } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';

@Component({
  selector: 'lorne-service-catalog-list',
  standalone: true,
  imports: [ButtonModule, CurrencyPipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, MenuModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <div class="flex flex-wrap items-center gap-1.5">
        @for (category of catalog().categories; track category.id) {
          <span class="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">{{ category.name }}</span>
        } @empty {
          <span class="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">No categories</span>
        }
      </div>

      <lorne-dense-collection-toolbar
        placeholder="Search services by name, category, description..."
        [query]="collection.query()"
        [totalCount]="catalog().serviceTypes.length"
        [filteredCount]="collection.filtered().length"
        [selectedCount]="collection.selectedCount()"
        [sortKey]="collection.sortKey()"
        [sortOptions]="collection.sortOptions"
        (queryChange)="collection.setQuery($event)"
        (sortKeyChange)="collection.setSort($event)"
        (clearSelection)="collection.clearSelection()"
      />

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[68rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Service</th>
                <th class="px-3 py-3">Category</th>
                <th class="px-3 py-3">Duration</th>
                <th class="px-3 py-3">Base price</th>
                <th class="px-3 py-3">Description</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (service of collection.page(); track service.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(service)" (change)="collection.toggle(service)" />
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex items-center gap-3">
                      <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700"><i class="pi pi-wrench"></i></span>
                      <div>
                        <p class="font-bold text-slate-950">{{ service.name }}</p>
                        @if (service.maintenanceRecordTemplate?.enabled) {
                          <p class="mt-0.5 text-xs font-black uppercase tracking-wide text-teal-700">Maintenance record</p>
                        }
                        @if (!service.active) {
                          <p class="text-xs font-black uppercase tracking-wide text-slate-400">Inactive</p>
                        }
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-3">
                    <p-tag [value]="service.categoryName || 'General'" severity="success" />
                  </td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ service.defaultDurationMinutes }} min</td>
                  <td class="px-3 py-3 font-semibold text-slate-700">{{ service.basePrice ? (service.basePrice | currency) : 'Per job' }}</td>
                  <td class="px-3 py-3 text-slate-600">
                    <p class="max-w-md truncate">{{ service.description || 'No description yet.' }}</p>
                  </td>
                  <td class="px-3 py-3 text-right">
                    <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openServiceMenu(service, $event, serviceMenu)"></button>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="7" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No services yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #serviceMenu [popup]="true" [model]="serviceMenuItems()" appendTo="body" />
      <lorne-dense-collection-footer
        [filteredCount]="collection.filtered().length"
        [pageIndex]="collection.pageIndex()"
        [pageCount]="collection.pageCount()"
        [pageSize]="collection.pageSize()"
        (pageSizeChange)="collection.setPageSize($event)"
        (previousPage)="collection.previousPage()"
        (nextPage)="collection.nextPage()"
      />
    </div>
  `
})
export class ServiceCatalogListComponent {
  catalog = input.required<ServiceCatalog>();
  readonly updateService = output<ServiceType>();
  readonly viewAssignedProperties = output<ServiceType>();
  readonly updateServiceStatus = output<{ service: ServiceType; active: boolean }>();
  readonly deleteService = output<ServiceType>();
  protected readonly serviceTypes = computed(() => this.catalog().serviceTypes);
  protected readonly selectedService = signal<ServiceType | null>(null);
  protected readonly serviceMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<ServiceType>(
    this.serviceTypes,
    (service) => service.id,
    (service) => [
      service.name,
      service.categoryName,
      service.description,
      String(service.defaultDurationMinutes),
      service.basePrice?.toString()
    ].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.name.localeCompare(right.name) },
      { label: 'Category A-Z', value: 'category-asc', compare: (left, right) => (left.categoryName ?? '').localeCompare(right.categoryName ?? '') },
      { label: 'Duration longest', value: 'duration-desc', compare: (left, right) => right.defaultDurationMinutes - left.defaultDurationMinutes },
      { label: 'Price highest', value: 'price-desc', compare: (left, right) => (right.basePrice ?? 0) - (left.basePrice ?? 0) }
    ]
  );

  protected openServiceMenu(service: ServiceType, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.selectedService.set(service);
    this.serviceMenuItems.set([
      { label: 'Update service', icon: 'pi pi-pencil', command: () => this.updateService.emit(service) },
      { label: 'Assigned properties', icon: 'pi pi-building', command: () => this.viewAssignedProperties.emit(service) },
      { separator: true },
      service.active
        ? { label: 'Deactivate service', icon: 'pi pi-ban', command: () => this.updateServiceStatus.emit({ service, active: false }) }
        : { label: 'Activate service', icon: 'pi pi-check-circle', command: () => this.updateServiceStatus.emit({ service, active: true }) },
      { label: 'Delete service', icon: 'pi pi-trash', command: () => this.deleteService.emit(service) }
    ]);
    menu.toggle(event);
  }
}
