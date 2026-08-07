import { ChangeDetectionStrategy, Component, ViewChild, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';
import { CreateServiceCategoryRequest, CreateServiceTypeRequest, ServiceCatalog } from '@lorne/contracts';
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
            <button pButton type="button" icon="pi pi-plus" label="Add service" (click)="showServiceDialog.set(true)"></button>
            <button pButton type="button" icon="pi pi-folder-plus" severity="secondary" label="Add category" (click)="showCategoryDialog.set(true)"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }
      @if (catalog(); as data) {
        <lorne-service-catalog-list [catalog]="data" />
      } @else {
        <div class="rounded border border-slate-200 bg-white p-6 text-slate-600">Loading service catalog...</div>
      }

      <p-dialog header="Add service category" [modal]="true" [visible]="showCategoryDialog()" [style]="{ width: 'min(34rem, 92vw)' }" (visibleChange)="showCategoryDialog.set($event)">
        <lorne-service-category-form [saving]="savingCategory()" (createCategory)="createCategory($event)" />
      </p-dialog>

      <p-dialog header="Add service type" [modal]="true" [visible]="showServiceDialog()" [style]="{ width: 'min(42rem, 92vw)' }" (visibleChange)="showServiceDialog.set($event)">
        @if (catalog(); as data) {
          <lorne-service-type-form [categories]="data.categories" [saving]="savingService()" (createService)="createServiceType($event)" />
        }
      </p-dialog>
    </section>
  `
})
export class ServiceCatalogPageComponent {
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  @ViewChild(ServiceCategoryFormComponent) private categoryForm?: ServiceCategoryFormComponent;
  @ViewChild(ServiceTypeFormComponent) private serviceTypeForm?: ServiceTypeFormComponent;
  protected readonly catalog = signal<ServiceCatalog | null>(null);
  protected readonly savingCategory = signal(false);
  protected readonly savingService = signal(false);
  protected readonly error = signal('');
  protected readonly showCategoryDialog = signal(false);
  protected readonly showServiceDialog = signal(false);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.catalog.set(await firstValueFrom(this.serviceCatalogService.catalog()));
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

  async createServiceType(request: CreateServiceTypeRequest): Promise<void> {
    if (this.savingService()) {
      return;
    }
    this.savingService.set(true);
    this.error.set('');
    try {
      const serviceType = await firstValueFrom(this.serviceCatalogService.createServiceType(request));
      this.catalog.update((catalog) => catalog ? { ...catalog, serviceTypes: [...catalog.serviceTypes, serviceType].sort((a, b) => a.name.localeCompare(b.name)) } : catalog);
      this.serviceTypeForm?.reset();
      this.showServiceDialog.set(false);
    } catch {
      this.error.set('Unable to create service. Check required fields or backend status.');
    } finally {
      this.savingService.set(false);
    }
  }
}
