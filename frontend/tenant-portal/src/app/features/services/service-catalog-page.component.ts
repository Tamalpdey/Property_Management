import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type { CreateServiceCategoryRequest, CreateServiceTypeRequest, PropertyRecord, ServiceCatalog, ServiceType } from '@lorne/contracts';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCategoryFormComponent } from './components/service-category-form.component';
import { ServiceCatalogListComponent } from './components/service-catalog-list.component';
import { ServiceTypeFormComponent } from './components/service-type-form.component';
import { ServiceCatalogService } from './services/service-catalog.service';

@Component({
  selector: 'lorne-service-catalog-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, ServiceCategoryFormComponent, ServiceCatalogListComponent, ServiceTypeFormComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Catalog" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Maintenance services</h1>
            @if (catalog(); as data) {
              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ data.serviceTypes.length }} records</span>
            }
          </div>
          <div class="flex flex-wrap gap-2">
            <button pButton type="button" icon="pi pi-plus" label="Add service" (click)="openCreateService()"></button>
            <button pButton type="button" icon="pi pi-folder-plus" severity="secondary" label="Add category" (click)="showCategoryDialog.set(true)"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (catalog(); as data) {
        <lorne-service-catalog-list
          [catalog]="data"
          (updateService)="openEditService($event)"
          (viewAssignedProperties)="openAssignedProperties($event)"
          (updateServiceStatus)="updateServiceStatus($event.service, $event.active)"
          (deleteService)="deleteService($event)"
        />
      } @else {
        <div class="rounded border border-slate-200 bg-white p-6 text-slate-600">Loading service catalog...</div>
      }

      <p-dialog header="Add service category" [modal]="true" [visible]="showCategoryDialog()" [style]="{ width: 'min(34rem, 92vw)' }" (visibleChange)="showCategoryDialog.set($event)">
        <lorne-service-category-form [saving]="savingCategory()" (createCategory)="createCategory($event)" />
      </p-dialog>

      <p-dialog
        [header]="editingService() ? 'Update service type' : 'Add service type'"
        [modal]="true"
        [visible]="showServiceDialog()"
        [style]="{ width: 'min(42rem, 92vw)' }"
        (visibleChange)="onServiceDialogVisible($event)"
      >
        @if (catalog(); as data) {
          <lorne-service-type-form [categories]="data.categories" [serviceType]="editingService()" [saving]="savingService()" (createService)="saveServiceType($event)" />
        }
      </p-dialog>

      <p-dialog
        header="Assigned properties"
        [modal]="true"
        [visible]="showAssignedPropertiesDialog()"
        [style]="{ width: '48rem', maxWidth: '94vw', height: '34rem', maxHeight: '90vh' }"
        [contentStyle]="{ height: 'calc(100% - 4rem)', overflow: 'auto' }"
        (visibleChange)="onAssignedPropertiesVisible($event)"
      >
        @if (selectedService(); as service) {
          <section class="space-y-3">
            <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">Service</p>
              <h3 class="text-lg font-black text-slate-950">{{ service.name }}</h3>
              <p class="text-sm font-semibold text-slate-600">{{ service.categoryName || 'General' }} · {{ assignedProperties().length }} assigned properties</p>
            </div>
            @if (assignedPropertiesLoading()) {
              <div class="flex min-h-40 items-center justify-center rounded-lg border border-slate-200 bg-white">
                <i class="pi pi-spin pi-spinner text-2xl text-teal-600"></i>
              </div>
            } @else {
              <div class="grid gap-2">
                @for (property of assignedProperties(); track property.id) {
                  <div class="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p class="font-black text-slate-950">{{ property.name }}</p>
                        <p class="mt-1 text-sm font-semibold text-slate-600">{{ property.ownerName }}</p>
                        <p class="mt-1 text-xs font-semibold text-slate-500">{{ property.addressLine1 }}, {{ property.city }}{{ property.provinceCode ? ', ' + property.provinceCode : '' }}</p>
                      </div>
                      <p-tag [value]="property.active ? 'active' : 'inactive'" [severity]="property.active ? 'success' : 'secondary'" />
                    </div>
                  </div>
                } @empty {
                  <p class="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-8 text-center text-sm font-semibold text-slate-500">No properties are assigned to this service.</p>
                }
              </div>
            }
          </section>
        }
      </p-dialog>
    </section>
  `
})
export class ServiceCatalogPageComponent {
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  private readonly propertyService = inject(PropertyService);
  @ViewChild(ServiceCategoryFormComponent) private categoryForm?: ServiceCategoryFormComponent;
  @ViewChild(ServiceTypeFormComponent) private serviceTypeForm?: ServiceTypeFormComponent;
  protected readonly catalog = signal<ServiceCatalog | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingService = signal(false);
  protected readonly updatingStatus = signal(false);
  protected readonly error = signal('');
  protected readonly showCategoryDialog = signal(false);
  protected readonly showServiceDialog = signal(false);
  protected readonly showAssignedPropertiesDialog = signal(false);
  protected readonly editingService = signal<ServiceType | null>(null);
  protected readonly selectedService = signal<ServiceType | null>(null);
  protected readonly assignedProperties = signal<PropertyRecord[]>([]);
  protected readonly assignedPropertiesLoading = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.error.set('');
    try {
      this.catalog.set(await firstValueFrom(this.serviceCatalogService.catalog()));
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load service catalog.'));
    }
  }

  async createCategory(request: CreateServiceCategoryRequest): Promise<void> {
    if (this.savingCategory()) {
      return;
    }
    this.savingCategory.set(true);
    this.error.set('');
    try {
      const category = await firstValueFrom(this.serviceCatalogService.createCategory(request));
      this.catalog.update((catalog) => catalog ? { ...catalog, categories: [...catalog.categories, category].sort((a, b) => a.name.localeCompare(b.name)) } : catalog);
      this.categoryForm?.reset();
      this.showCategoryDialog.set(false);
    } catch {
      this.error.set('Unable to create category. Check for duplicate names or backend status.');
    } finally {
      this.savingCategory.set(false);
    }
  }

  protected openCreateService(): void {
    this.editingService.set(null);
    this.showServiceDialog.set(true);
    setTimeout(() => this.serviceTypeForm?.reset());
  }

  protected openEditService(service: ServiceType): void {
    this.editingService.set(service);
    this.showServiceDialog.set(true);
    setTimeout(() => this.serviceTypeForm?.loadService(service));
  }

  protected onServiceDialogVisible(visible: boolean): void {
    this.showServiceDialog.set(visible);
    if (!visible) {
      this.editingService.set(null);
      this.serviceTypeForm?.reset();
    }
  }

  async saveServiceType(request: CreateServiceTypeRequest): Promise<void> {
    if (this.savingService()) {
      return;
    }
    this.savingService.set(true);
    this.error.set('');
    try {
      const editingService = this.editingService();
      const serviceType = editingService
        ? await firstValueFrom(this.serviceCatalogService.updateServiceType(editingService.id, request))
        : await firstValueFrom(this.serviceCatalogService.createServiceType(request));
      this.catalog.update((catalog) => catalog ? {
        ...catalog,
        serviceTypes: [serviceType, ...catalog.serviceTypes.filter((candidate) => candidate.id !== serviceType.id)].sort((a, b) => a.name.localeCompare(b.name))
      } : catalog);
      this.serviceTypeForm?.reset();
      this.showServiceDialog.set(false);
      this.editingService.set(null);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to save service. Check required fields, duplicate names, or backend status.'));
    } finally {
      this.savingService.set(false);
    }
  }

  protected async updateServiceStatus(service: ServiceType, active: boolean): Promise<void> {
    if (this.updatingStatus()) {
      return;
    }
    this.updatingStatus.set(true);
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.serviceCatalogService.updateServiceTypeStatus(service.id, { active }));
      this.replaceService(updated);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, active ? 'Unable to activate service.' : 'Unable to deactivate service.'));
    } finally {
      this.updatingStatus.set(false);
    }
  }

  protected async deleteService(service: ServiceType): Promise<void> {
    if (!confirm(`Delete ${service.name}? Services with property, worker, recurring, or work order history should be deactivated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.serviceCatalogService.deleteServiceType(service.id));
      this.catalog.update((catalog) => catalog ? { ...catalog, serviceTypes: catalog.serviceTypes.filter((candidate) => candidate.id !== service.id) } : catalog);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to delete service. Deactivate services that already have property or work history.'));
    }
  }

  protected async openAssignedProperties(service: ServiceType): Promise<void> {
    this.selectedService.set(service);
    this.assignedProperties.set([]);
    this.assignedPropertiesLoading.set(true);
    this.showAssignedPropertiesDialog.set(true);
    this.error.set('');
    try {
      const properties = await firstValueFrom(this.propertyService.list());
      this.assignedProperties.set(properties
        .filter((property) => property.services.some((assignment) => assignment.serviceTypeId === service.id))
        .sort((left, right) => left.name.localeCompare(right.name)));
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load assigned properties.'));
    } finally {
      this.assignedPropertiesLoading.set(false);
    }
  }

  protected onAssignedPropertiesVisible(visible: boolean): void {
    this.showAssignedPropertiesDialog.set(visible);
    if (!visible) {
      this.selectedService.set(null);
      this.assignedProperties.set([]);
    }
  }

  private replaceService(serviceType: ServiceType): void {
    this.catalog.update((catalog) => catalog ? {
      ...catalog,
      serviceTypes: [serviceType, ...catalog.serviceTypes.filter((candidate) => candidate.id !== serviceType.id)].sort((a, b) => a.name.localeCompare(b.name))
    } : catalog);
  }
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (typeof exception === 'object' && exception !== null && 'error' in exception) {
    const body = (exception as { error?: { error?: { message?: unknown } } }).error;
    const message = typeof body?.error?.message === 'string' ? body.error.message : undefined;
    return message || fallback;
  }
  return fallback;
}
