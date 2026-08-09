import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreatePropertyOwnerRequest, PropertyOwner } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { OwnerListComponent } from './components/owner-list.component';
import { PropertyOwnerService } from './services/property-owner.service';

@Component({
  selector: 'lorne-property-owner-page',
  standalone: true,
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, OwnerListComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Owners" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Property owners</h1>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ owners().length }} records</span>
          </div>
          <div class="flex gap-2">
            <button pButton type="button" icon="pi pi-plus" label="Add owner" (click)="openCreate()"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <lorne-owner-list
        [owners]="owners()"
        (editOwner)="openEdit($event)"
        (activateOwner)="setActive($event, true)"
        (deactivateOwner)="setActive($event, false)"
        (deleteOwner)="delete($event)"
      />

      <p-dialog
        [header]="editingOwner() ? 'Update portfolio owner' : 'Add portfolio owner'"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(42rem, 92vw)' }"
        (visibleChange)="visibleChange($event)"
      >
        <form class="grid gap-4" (ngSubmit)="create()">
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Owner name</span>
            <input pInputText class="w-full" name="displayName" required [(ngModel)]="form.displayName" />
          </label>
          <div class="grid gap-3 md:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Email</span>
              <input pInputText class="w-full" name="email" type="email" [(ngModel)]="form.email" />
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-semibold text-slate-700">Phone</span>
              <input pInputText class="w-full" name="phone" [(ngModel)]="form.phone" />
            </label>
          </div>
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Billing email</span>
            <input pInputText class="w-full" name="billingEmail" type="email" [(ngModel)]="form.billingEmail" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-semibold text-slate-700">Owner notes</span>
            <textarea class="w-full border border-slate-300 px-3 py-2" name="notes" rows="4" [(ngModel)]="form.notes"></textarea>
          </label>
          <div class="flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Cancel" (click)="closeDialog()"></button>
            <button pButton type="submit" [icon]="editingOwner() ? 'pi pi-save' : 'pi pi-plus'" [loading]="saving()" [label]="editingOwner() ? 'Save owner' : 'Create owner'"></button>
          </div>
        </form>
      </p-dialog>
    </section>
  `
})
export class PropertyOwnerPageComponent {
  private readonly propertyOwnerService = inject(PropertyOwnerService);
  protected readonly owners = signal<PropertyOwner[]>([]);
  protected readonly saving = signal(false);
  protected readonly showCreate = signal(false);
  protected readonly editingOwner = signal<PropertyOwner | null>(null);
  protected readonly error = signal('');
  protected form: CreatePropertyOwnerRequest = this.blankForm();

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.owners.set(await firstValueFrom(this.propertyOwnerService.list()));
  }

  openCreate(): void {
    this.editingOwner.set(null);
    this.form = this.blankForm();
    this.showCreate.set(true);
  }

  openEdit(owner: PropertyOwner): void {
    this.editingOwner.set(owner);
    this.form = {
      displayName: owner.displayName,
      email: owner.email || '',
      phone: owner.phone || '',
      billingEmail: owner.billingEmail || '',
      notes: owner.notes || ''
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
    this.editingOwner.set(null);
    this.form = this.blankForm();
  }

  async create(): Promise<void> {
    if (!this.form.displayName?.trim()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const editingOwner = this.editingOwner();
      const owner = editingOwner
        ? await firstValueFrom(this.propertyOwnerService.update(editingOwner.id, this.form))
        : await firstValueFrom(this.propertyOwnerService.create(this.form));
      this.owners.update((owners) => [owner, ...owners.filter((candidate) => candidate.id !== owner.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
      this.closeDialog();
    } catch {
      this.error.set('Unable to save property owner.');
    } finally {
      this.saving.set(false);
    }
  }

  async setActive(owner: PropertyOwner, active: boolean): Promise<void> {
    this.error.set('');
    try {
      const updated = await firstValueFrom(this.propertyOwnerService.updateStatus(owner.id, active));
      this.owners.update((owners) => [updated, ...owners.filter((candidate) => candidate.id !== updated.id)].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    } catch {
      this.error.set(active ? 'Unable to activate property owner.' : 'Unable to deactivate property owner.');
    }
  }

  async delete(owner: PropertyOwner): Promise<void> {
    if (!confirm(`Delete ${owner.displayName}? Owners with properties must be deactivated instead.`)) {
      return;
    }
    this.error.set('');
    try {
      await firstValueFrom(this.propertyOwnerService.delete(owner.id));
      this.owners.update((owners) => owners.filter((candidate) => candidate.id !== owner.id));
    } catch {
      this.error.set('Unable to delete owner. Deactivate owners that still have properties.');
    }
  }

  private blankForm(): CreatePropertyOwnerRequest {
    return { displayName: '', email: '', phone: '', billingEmail: '', notes: '' };
  }
}
