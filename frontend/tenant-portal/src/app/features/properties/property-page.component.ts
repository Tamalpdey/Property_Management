import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreatePropertyRequest, PropertyOwner, PropertyRecord, ServiceType } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { PropertyOwnerService } from '../owners/services/property-owner.service';
import { ServiceCatalogService } from '../services/services/service-catalog.service';
import { PropertyListComponent } from './components/property-list.component';
import { PropertyService } from './services/property.service';

@Component({
  selector: 'lorne-property-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, PropertyListComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Properties" severity="success" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Managed properties</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ properties().length }} records</span>
          </div>
          <div class="flex gap-2">
            <button pButton type="button" icon="pi pi-plus" label="Add property" (click)="showCreate.set(true)"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      <lorne-property-list
        [properties]="properties()"
        [serviceTypes]="serviceTypes()"
        [savingPropertyId]="savingPropertyId()"
        (servicesChanged)="updateServices($event.propertyId, $event.serviceTypeIds)"
      />

      <p-dialog
        header="Add managed property"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(48rem, 92vw)' }"
        (visibleChange)="showCreate.set($event)"
      >
        <form class="grid gap-4" (ngSubmit)="create()">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Owner</span>
              <select class="w-full border border-slate-300 px-3 py-2" name="ownerId" required [(ngModel)]="form.ownerId">
                <option value="">Select owner</option>
                @for (owner of owners(); track owner.id) {
                  <option [value]="owner.id">{{ owner.displayName }}</option>
                }
              </select>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Property name</span>
              <input pInputText class="w-full" name="name" required [(ngModel)]="form.name" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Address</span>
              <input pInputText class="w-full" name="addressLine1" required [(ngModel)]="form.addressLine1" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">City</span>
              <input pInputText class="w-full" name="city" required [(ngModel)]="form.city" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Province</span>
                <input pInputText class="w-full" name="provinceCode" [(ngModel)]="form.provinceCode" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Postal code</span>
                <input pInputText class="w-full" name="postalCode" [(ngModel)]="form.postalCode" />
              </label>
            </div>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Service notes</span>
              <textarea class="w-full border border-slate-300 px-3 py-2" name="serviceNotes" rows="4" [(ngModel)]="form.serviceNotes"></textarea>
            </label>
          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showCreate.set(false)"></button>
            <button pButton type="submit" icon="pi pi-plus" [loading]="saving()" label="Create property"></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class PropertyPageComponent {
  private readonly propertyService = inject(PropertyService);
  private readonly propertyOwnerService = inject(PropertyOwnerService);
  private readonly serviceCatalogService = inject(ServiceCatalogService);
  protected readonly owners = signal<PropertyOwner[]>([]);
  protected readonly properties = signal<PropertyRecord[]>([]);
  protected readonly serviceTypes = signal<ServiceType[]>([]);
  protected readonly saving = signal(false);
  protected readonly savingPropertyId = signal<string | null>(null);
  protected readonly showCreate = signal(false);
  protected form: CreatePropertyRequest = this.blankForm();

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const [owners, properties, catalog] = await Promise.all([
      firstValueFrom(this.propertyOwnerService.list()),
      firstValueFrom(this.propertyService.list()),
      firstValueFrom(this.serviceCatalogService.catalog())
    ]);
    this.owners.set(owners);
    this.properties.set(properties);
    this.serviceTypes.set(catalog.serviceTypes);
  }

  async create(): Promise<void> {
    if (!this.form.ownerId || !this.form.name?.trim() || !this.form.addressLine1?.trim() || !this.form.city?.trim()) {
      return;
    }
    this.saving.set(true);
    try {
      const property = await firstValueFrom(this.propertyService.create(this.form));
      this.properties.update((properties) => [property, ...properties]);
      this.form = this.blankForm();
      this.showCreate.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  async updateServices(propertyId: string, serviceTypeIds: string[]): Promise<void> {
    if (this.savingPropertyId()) {
      return;
    }
    this.savingPropertyId.set(propertyId);
    try {
      const updatedProperty = await firstValueFrom(this.propertyService.updateServices(propertyId, { serviceTypeIds }));
      this.properties.update((properties) => properties.map((property) => property.id === updatedProperty.id ? updatedProperty : property));
    } finally {
      this.savingPropertyId.set(null);
    }
  }

  private blankForm(): CreatePropertyRequest {
    return { ownerId: '', name: '', addressLine1: '', city: '', provinceCode: 'ON', postalCode: '', countryCode: 'CA', serviceNotes: '' };
  }
}
