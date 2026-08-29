import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import type { CreateServiceCategoryRequest, CreateServiceTypeRequest, PropertyRecord, ServiceCatalog, ServiceCategory, ServiceType } from '@lorne/contracts';
import { PropertyService } from '../properties/services/property.service';
import { ServiceCategoryFormComponent } from './components/service-category-form.component';
import { ServiceCatalogListComponent } from './components/service-catalog-list.component';
import { ServiceTypeFormComponent } from './components/service-type-form.component';
import { ServiceCatalogService } from './services/service-catalog.service';

@Component({
  selector: 'lorne-service-catalog-page',
  standalone: true,
  imports: [ButtonModule, ConfirmDialogModule, DialogModule, ServiceCategoryFormComponent, ServiceCatalogListComponent, ServiceTypeFormComponent, TagModule],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <p-confirmDialog />
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
            <button pButton type="button" icon="pi pi-upload" severity="secondary" label="Import" (click)="showImportNotice()"></button>
            <button pButton type="button" icon="pi pi-plus" label="Add service" (click)="openCreateService()"></button>
            <button pButton type="button" icon="pi pi-folder-plus" severity="secondary" label="Categories" (click)="openCategoryDialog()"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (importNotice()) {
        <p class="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">{{ importNotice() }}</p>
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

      <p-dialog
        header="Service category management"
        [modal]="true"
        [visible]="showCategoryDialog()"
        [style]="{ width: 'min(58rem, 94vw)' }"
        [contentStyle]="{ maxHeight: '70vh', overflow: 'auto' }"
        (visibleChange)="onCategoryDialogVisible($event)"
      >
        @if (catalog(); as data) {
          <div class="grid gap-4 lg:grid-cols-[22rem_1fr]">
            <section class="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <lorne-service-category-form [saving]="savingCategory()" (saveCategory)="saveCategory($event)" />
            </section>
            <section class="rounded-lg border border-slate-200 bg-white">
              <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p class="text-xs font-black uppercase tracking-wide text-teal-700">Categories</p>
                  <h3 class="text-lg font-black text-slate-950">Service category list</h3>
                </div>
                <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{{ data.categories.length }} total</span>
              </div>
              <div class="divide-y divide-slate-100">
                @for (category of data.categories; track category.id) {
                  <div class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-black text-slate-950">{{ category.name }}</p>
                        <p-tag [value]="category.active ? 'active' : 'inactive'" [severity]="category.active ? 'success' : 'secondary'" />
                      </div>
                      <p class="mt-1 text-xs font-semibold text-slate-500">
                        {{ wsibLabel(category) }} · {{ serviceCountForCategory(category.id, data) }} services
                      </p>
                    </div>
                    <div class="flex shrink-0 justify-end gap-2">
                      <button pButton type="button" size="small" severity="secondary" icon="pi pi-pencil" label="Edit" (click)="editCategory(category)"></button>
                      <button
                        pButton
                        type="button"
                        size="small"
                        [severity]="category.active ? 'secondary' : 'success'"
                        outlined
                        [icon]="category.active ? 'pi pi-eye-slash' : 'pi pi-eye'"
                        [label]="category.active ? 'Deactivate' : 'Activate'"
                        [loading]="togglingCategoryId() === category.id"
                        (click)="confirmCategoryStatus(category)"
                      ></button>
                      <button
                        pButton
                        type="button"
                        size="small"
                        severity="danger"
                        outlined
                        icon="pi pi-trash"
                        label="Delete"
                        [loading]="deletingCategoryId() === category.id"
                        (click)="deleteCategory(category)"
                      ></button>
                    </div>
                  </div>
                } @empty {
                  <p class="px-4 py-10 text-center text-sm font-semibold text-slate-500">No categories yet.</p>
                }
              </div>
            </section>
          </div>
        }
      </p-dialog>

      <p-dialog
        [header]="editingService() ? 'Update service type' : 'Add service type'"
        [modal]="true"
        [visible]="showServiceDialog()"
        [style]="{ width: 'min(42rem, 92vw)' }"
        (visibleChange)="onServiceDialogVisible($event)"
      >
        @if (catalog(); as data) {
          <div class="relative min-h-[26rem]">
            <div [class.pointer-events-none]="serviceDialogLoading()" [class.opacity-20]="serviceDialogLoading()">
              <lorne-service-type-form [categories]="data.categories" [serviceType]="editingService()" [saving]="savingService()" (createService)="saveServiceType($event)" />
            </div>
            @if (serviceDialogLoading()) {
              <div class="absolute inset-0 grid place-items-center rounded-lg border border-slate-200 bg-white/90 backdrop-blur-sm">
                <div class="rounded-lg border border-teal-100 bg-teal-50 px-6 py-5 text-center shadow-sm">
                  <i class="pi pi-spin pi-spinner text-3xl text-teal-600"></i>
                  <p class="mt-3 text-sm font-black text-slate-900">Loading service details</p>
                  <p class="mt-1 text-xs font-semibold text-slate-500">Preparing the edit form...</p>
                </div>
              </div>
            }
          </div>
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
  private readonly confirmationService = inject(ConfirmationService);
  @ViewChild(ServiceCategoryFormComponent) private categoryForm?: ServiceCategoryFormComponent;
  @ViewChild(ServiceTypeFormComponent) private serviceTypeForm?: ServiceTypeFormComponent;
  protected readonly catalog = signal<ServiceCatalog | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingService = signal(false);
  protected readonly updatingStatus = signal(false);
  protected readonly error = signal('');
  protected readonly importNotice = signal('');
  protected readonly showCategoryDialog = signal(false);
  protected readonly showServiceDialog = signal(false);
  protected readonly serviceDialogLoading = signal(false);
  protected readonly showAssignedPropertiesDialog = signal(false);
  protected readonly editingCategory = signal<ServiceCategory | null>(null);
  protected readonly deletingCategoryId = signal('');
  protected readonly togglingCategoryId = signal('');
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

  protected openCategoryDialog(): void {
    this.error.set('');
    this.editingCategory.set(null);
    this.showCategoryDialog.set(true);
    setTimeout(() => this.categoryForm?.reset());
  }

  protected onCategoryDialogVisible(visible: boolean): void {
    this.showCategoryDialog.set(visible);
    if (!visible) {
      this.editingCategory.set(null);
      this.categoryForm?.reset();
    }
  }

  async saveCategory(request: CreateServiceCategoryRequest): Promise<void> {
    if (this.savingCategory()) {
      return;
    }
    this.savingCategory.set(true);
    this.error.set('');
    try {
      const editingCategory = this.editingCategory();
      const category = editingCategory
        ? await firstValueFrom(this.serviceCatalogService.updateCategory(editingCategory.id, request))
        : await firstValueFrom(this.serviceCatalogService.createCategory(request));
      this.replaceCategory(category);
      this.categoryForm?.reset();
      this.editingCategory.set(null);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to save category. Check for duplicate names or backend status.'));
    } finally {
      this.savingCategory.set(false);
    }
  }

  protected editCategory(category: ServiceCategory): void {
    this.editingCategory.set(category);
    setTimeout(() => this.categoryForm?.loadCategory(category));
  }

  protected confirmCategoryStatus(category: ServiceCategory): void {
    const active = !category.active;
    this.confirmationService.confirm({
      header: active ? 'Activate category?' : 'Deactivate category?',
      message: active
        ? `Activate "${category.name}" so it can be used for new services.`
        : `Deactivate "${category.name}" to keep history intact while hiding it from active setup.`,
      icon: active ? 'pi pi-eye' : 'pi pi-eye-slash',
      acceptLabel: active ? 'Activate' : 'Deactivate',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: active ? 'p-button-success' : 'p-button-warning',
      accept: () => void this.updateCategoryStatus(category, active)
    });
  }

  private async updateCategoryStatus(category: ServiceCategory, active: boolean): Promise<void> {
    if (this.togglingCategoryId()) {
      return;
    }
    this.togglingCategoryId.set(category.id);
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.serviceCatalogService.updateCategoryStatus(category.id, { active }));
      this.replaceCategory(updated);
      if (this.editingCategory()?.id === category.id) {
        this.editingCategory.set(updated);
        setTimeout(() => this.categoryForm?.loadCategory(updated));
      }
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, active ? 'Unable to activate category.' : 'Unable to deactivate category.'));
    } finally {
      this.togglingCategoryId.set('');
    }
  }

  protected deleteCategory(category: ServiceCategory): void {
    const serviceCount = this.catalog()?.serviceTypes.filter((service) => service.categoryId === category.id).length ?? 0;
    if (serviceCount > 0) {
      this.confirmationService.confirm({
        header: 'Category has linked services',
        message: `"${category.name}" is used by ${serviceCount} service${serviceCount === 1 ? '' : 's'}, so it cannot be deleted. Deactivate it instead to preserve work-order and service history.`,
        icon: 'pi pi-info-circle',
        acceptLabel: category.active ? 'Deactivate category' : 'OK',
        rejectVisible: category.active,
        acceptButtonStyleClass: category.active ? 'p-button-warning' : 'p-button-secondary',
        accept: () => {
          if (category.active) {
            void this.updateCategoryStatus(category, false);
          }
        }
      });
      return;
    }
    this.confirmationService.confirm({
      header: 'Delete category?',
      message: `Delete "${category.name}"? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => void this.deleteCategoryAfterConfirmation(category)
    });
  }

  private async deleteCategoryAfterConfirmation(category: ServiceCategory): Promise<void> {
    this.deletingCategoryId.set(category.id);
    this.error.set('');
    try {
      await firstValueFrom(this.serviceCatalogService.deleteCategory(category.id));
      this.catalog.update((catalog) => catalog ? { ...catalog, categories: catalog.categories.filter((candidate) => candidate.id !== category.id) } : catalog);
      if (this.editingCategory()?.id === category.id) {
        this.editingCategory.set(null);
        this.categoryForm?.reset();
      }
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to delete category. Categories with service or work history should remain active.'));
    } finally {
      this.deletingCategoryId.set('');
    }
  }

  protected serviceCountForCategory(categoryId: string, catalog: ServiceCatalog): number {
    return catalog.serviceTypes.filter((service) => service.categoryId === categoryId).length;
  }

  protected wsibLabel(category: ServiceCategory): string {
    return category.wsibRatePercent === null || category.wsibRatePercent === undefined
      ? 'No WSIB rate'
      : `${Number(category.wsibRatePercent).toFixed(4).replace(/\.?0+$/, '')}% WSIB`;
  }

  protected openCreateService(): void {
    this.editingService.set(null);
    this.serviceDialogLoading.set(false);
    this.showServiceDialog.set(true);
    setTimeout(() => this.serviceTypeForm?.reset());
  }

  protected showImportNotice(): void {
    this.error.set('');
    this.importNotice.set('Service import is ready for the toolbar; CSV mapping and backend import processing will be wired as the next import slice.');
  }

  protected openEditService(service: ServiceType): void {
    this.editingService.set(service);
    this.serviceDialogLoading.set(true);
    this.showServiceDialog.set(true);
    setTimeout(() => {
      this.serviceTypeForm?.loadService(service);
      setTimeout(() => this.serviceDialogLoading.set(false), 150);
    });
  }

  protected onServiceDialogVisible(visible: boolean): void {
    this.showServiceDialog.set(visible);
    if (!visible) {
      this.editingService.set(null);
      this.serviceDialogLoading.set(false);
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

  private replaceCategory(category: ServiceCategory): void {
    this.catalog.update((catalog) => catalog ? {
      ...catalog,
      categories: [category, ...catalog.categories.filter((candidate) => candidate.id !== category.id)].sort((a, b) => a.name.localeCompare(b.name))
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
