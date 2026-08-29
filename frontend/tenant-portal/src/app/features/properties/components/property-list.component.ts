import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import type { PropertyRecord, ServiceType } from '@lorne/contracts';
import { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MenuModule } from 'primeng/menu';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';
import { PropertyServicePickerComponent } from './property-service-picker.component';

@Component({
  selector: 'lorne-property-list',
  standalone: true,
  imports: [ButtonModule, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, DialogModule, MenuModule, PropertyServicePickerComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search properties by ID, owner ID, name, owner, address, city, service..."
        [query]="collection.query()"
        [totalCount]="properties().length"
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
          <table class="w-full min-w-[72rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Property</th>
                <th class="px-3 py-3">Owner</th>
                <th class="px-3 py-3">Address</th>
                <th class="px-3 py-3">Services</th>
                <th class="px-3 py-3">Status</th>
                <th class="w-16 px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
      @for (property of collection.page(); track property.id) {
              <tr class="hover:bg-slate-50">
                <td class="px-3 py-3">
                  <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(property)" (change)="collection.toggle(property)" />
                </td>
                <td class="px-3 py-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-bold text-slate-950">{{ property.name }}</p>
                    <span class="rounded bg-teal-50 px-1.5 py-0.5 font-mono text-[0.68rem] font-black text-teal-700">{{ property.propertyCode }}</span>
                  </div>
                  <p class="text-xs text-slate-500">{{ property.serviceNotes || 'No service notes' }}</p>
                </td>
                <td class="px-3 py-3">
                  <p class="font-semibold text-teal-700">{{ property.ownerName }}</p>
                  <p class="mt-0.5 font-mono text-[0.68rem] font-black text-slate-500">{{ property.ownerCode }}</p>
                </td>
                <td class="px-3 py-3 text-slate-600">
                  <p>{{ property.addressLine1 }}</p>
                  <p class="text-xs text-slate-500">{{ property.city }}, {{ property.provinceCode }} {{ property.postalCode }}</p>
                </td>
                <td class="px-3 py-3">
                  <div class="flex max-w-xs flex-wrap gap-1">
                    @for (service of property.services.slice(0, 3); track service.id) {
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{{ service.serviceName }}</span>
                    } @empty {
                      <span class="text-xs font-semibold text-amber-700">No services</span>
                    }
                    @if (property.services.length > 3) {
                      <button
                        type="button"
                        class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 transition hover:bg-teal-50 hover:text-teal-800"
                        [title]="hiddenServiceNames(property)"
                        (click)="selectedProperty.set(property)"
                      >
                        +{{ property.services.length - 3 }} more
                      </button>
                    }
                  </div>
                </td>
                <td class="px-3 py-3">
                  <p-tag [value]="property.active ? 'Active' : 'Inactive'" [severity]="property.active ? 'success' : 'secondary'" />
                </td>
                <td class="px-3 py-3 text-right">
                  <button pButton type="button" text rounded icon="pi pi-ellipsis-v" (click)="openPropertyMenu(property, $event, propertyMenu)"></button>
                </td>
              </tr>
      } @empty {
              <tr>
                <td colspan="7" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No properties found.</td>
              </tr>
      }
            </tbody>
          </table>
        </div>
      </div>
      <p-menu #propertyMenu [popup]="true" [model]="propertyMenuItems()" appendTo="body" />
      <lorne-dense-collection-footer
        [filteredCount]="collection.filtered().length"
        [pageIndex]="collection.pageIndex()"
        [pageCount]="collection.pageCount()"
        [pageSize]="collection.pageSize()"
        (pageSizeChange)="collection.setPageSize($event)"
        (previousPage)="collection.previousPage()"
        (nextPage)="collection.nextPage()"
      />

      <p-dialog
        header="Property service profiles"
        [modal]="true"
        [visible]="!!selectedProperty()"
        [style]="{ width: 'min(42rem, 92vw)' }"
        (visibleChange)="!$event && selectedProperty.set(null)"
      >
        @if (selectedProperty(); as property) {
          <div class="space-y-4">
            <div>
              <h3 class="text-lg font-bold text-slate-950">{{ property.name }}</h3>
              <p class="mt-1 text-sm text-slate-600">{{ property.propertyCode }} · {{ property.ownerName }} · {{ property.ownerCode }} · {{ property.addressLine1 }}, {{ property.city }}</p>
            </div>
            <lorne-property-service-picker
              [property]="property"
              [serviceTypes]="serviceTypes()"
              [saving]="savingPropertyId() === property.id"
              (servicesChanged)="servicesChanged.emit($event)"
            />
          </div>
        }
      </p-dialog>
    </div>
  `
})
export class PropertyListComponent {
  properties = input.required<PropertyRecord[]>();
  serviceTypes = input.required<ServiceType[]>();
  savingPropertyId = input<string | null>(null);
  editProperty = output<PropertyRecord>();
  updatePropertyStatus = output<{ property: PropertyRecord; active: boolean }>();
  deleteProperty = output<PropertyRecord>();
  servicesChanged = output<{ propertyId: string; serviceTypeIds: string[] }>();
  protected readonly selectedProperty = signal<PropertyRecord | null>(null);
  protected readonly propertyMenuItems = signal<MenuItem[]>([]);
  protected readonly collection = new DenseCollectionState<PropertyRecord>(
    this.properties,
    (property) => property.id,
    (property) => [
      property.name,
      property.propertyCode,
      property.ownerName,
      property.ownerCode,
      property.addressLine1,
      property.city,
      property.provinceCode,
      property.postalCode,
      property.serviceNotes,
      ...property.services.map((service) => service.serviceName)
    ].filter(Boolean).join(' '),
    [
      { label: 'Name A-Z', value: 'name-asc', compare: (left, right) => left.name.localeCompare(right.name) },
      { label: 'Owner A-Z', value: 'owner-asc', compare: (left, right) => left.ownerName.localeCompare(right.ownerName) },
      { label: 'City A-Z', value: 'city-asc', compare: (left, right) => left.city.localeCompare(right.city) },
      { label: 'Most services', value: 'services-desc', compare: (left, right) => right.services.length - left.services.length }
    ]
  );

  protected openPropertyMenu(property: PropertyRecord, event: Event, menu: { toggle: (event: Event) => void }): void {
    this.propertyMenuItems.set([
      { label: 'Service profiles', icon: 'pi pi-wrench', command: () => this.selectedProperty.set(property) },
      { label: 'Update property', icon: 'pi pi-pencil', command: () => this.editProperty.emit(property) },
      { separator: true },
      property.active
        ? { label: 'Deactivate property', icon: 'pi pi-ban', command: () => this.updatePropertyStatus.emit({ property, active: false }) }
        : { label: 'Activate property', icon: 'pi pi-check-circle', command: () => this.updatePropertyStatus.emit({ property, active: true }) },
      { label: 'Delete property', icon: 'pi pi-trash', command: () => this.deleteProperty.emit(property) }
    ]);
    menu.toggle(event);
  }

  protected hiddenServiceNames(property: PropertyRecord): string {
    return property.services.slice(3).map((service) => service.serviceName).join('\n');
  }
}
