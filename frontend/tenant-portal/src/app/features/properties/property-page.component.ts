import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CreatePropertyRequest, PropertyOwner, PropertyRecord, ServiceType } from '@lorne/contracts';
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
            <button pButton type="button" icon="pi pi-plus" label="Add property" (click)="openCreate()"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-property-list
        [properties]="properties()"
        [serviceTypes]="serviceTypes()"
        [savingPropertyId]="savingPropertyId()"
        (editProperty)="openEdit($event)"
        (updatePropertyStatus)="setActive($event.property, $event.active)"
        (deleteProperty)="delete($event)"
        (servicesChanged)="updateServices($event.propertyId, $event.serviceTypeIds)"
      />

      <p-dialog
        [header]="editingProperty() ? 'Update managed property' : 'Add managed property'"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(48rem, 92vw)' }"
        (visibleChange)="visibleChange($event)"
      >
        <form class="grid gap-4" (ngSubmit)="save()">
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
              <span class="mb-1 block text-sm font-semibold text-slate-700">Address 2</span>
              <input pInputText class="w-full" name="addressLine2" [(ngModel)]="form.addressLine2" />
            </label>
            <div class="grid grid-cols-2 gap-2">
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">City</span>
                <input pInputText class="w-full" name="city" required [(ngModel)]="form.city" />
              </label>
              <label class="block">
                <span class="mb-1 block text-sm font-semibold text-slate-700">Country</span>
                <input pInputText class="w-full" name="countryCode" maxlength="2" [(ngModel)]="form.countryCode" />
              </label>
            </div>
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
            <button pButton type="button" severity="secondary" label="Cancel" (click)="closeDialog()"></button>
            <button pButton type="submit" [icon]="editingProperty() ? 'pi pi-save' : 'pi pi-plus'" [loading]="saving()" [label]="editingProperty() ? 'Save property' : 'Create property'"></button>
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
  protected readonly editingProperty = signal<PropertyRecord | null>(null);
  protected readonly error = signal('');
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

  openCreate(): void {
    this.editingProperty.set(null);
    this.form = this.blankForm();
    this.showCreate.set(true);
  }

  openEdit(property: PropertyRecord): void {
    this.editingProperty.set(property);
    this.form = {
      ownerId: property.ownerId,
      name: property.name,
      addressLine1: property.addressLine1,
      addressLine2: property.addressLine2 || '',
      city: property.city,
      provinceCode: property.provinceCode || '',
      postalCode: property.postalCode || '',
      countryCode: property.countryCode || 'CA',
      serviceNotes: property.serviceNotes || ''
    };
    this.showCreate.set(true);
  }

  visibleChange(visible: boolean): void {
    if (visible) {
      this.showCreate.set(true);
    } else {
      this.closeDialog();
    }
  }

  closeDialog(): void {
    this.showCreate.set(false);
    this.editingProperty.set(null);
    this.form = this.blankForm();
  }

  async save(): Promise<void> {
    if (!this.form.ownerId || !this.form.name?.trim() || !this.form.addressLine1?.trim() || !this.form.city?.trim()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const editingProperty = this.editingProperty();
      const property = editingProperty
        ? await firstValueFrom(this.propertyService.update(editingProperty.id, this.form))
        : await firstValueFrom(this.propertyService.create(this.form));
      this.properties.update((properties) => [property, ...properties.filter((candidate) => candidate.id !== property.id)]);
      this.closeDialog();
    } catch {
      this.error.set('Unable to save property. Check owner, required fields, or backend status.');
    } finally {
      this.saving.set(false);
    }
  }

  async updateServices(propertyId: string, serviceTypeIds: string[]): Promise<void> {
    if (this.savingPropertyId()) {
      return;
    }
    this.savingPropertyId.set(propertyId);
    this.error.set('');
    try {
      const updatedProperty = await firstValueFrom(this.propertyService.updateServices(propertyId, { serviceTypeIds }));
      this.properties.update((properties) => properties.map((property) => property.id === updatedProperty.id ? updatedProperty : property));
    } catch {
      this.error.set('Unable to update property service profiles.');
    } finally {
      this.savingPropertyId.set(null);
    }
  }

  async setActive(property: PropertyRecord, active: boolean): Promise<void> {
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.propertyService.updateStatus(property.id, active));
      this.properties.update((properties) => [updated, ...properties.filter((candidate) => candidate.id !== updated.id)]);
    } catch {
      this.error.set(active ? 'Unable to activate property.' : 'Unable to deactivate property.');
    }
  }

  async delete(property: PropertyRecord): Promise<void> {
    if (!confirm(`Delete ${property.name}? Properties with work orders or recurring templates must be deactivated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.propertyService.delete(property.id));
      this.properties.update((properties) => properties.filter((candidate) => candidate.id !== property.id));
    } catch {
      this.error.set('Unable to delete property. Deactivate properties that already have work history.');
    }
  }

  private blankForm(): CreatePropertyRequest {
    return { ownerId: '', name: '', addressLine1: '', addressLine2: '', city: '', provinceCode: 'ON', postalCode: '', countryCode: 'CA', serviceNotes: '' };
  }
}
