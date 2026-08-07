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
            <button pButton type="button" icon="pi pi-plus" label="Add owner" (click)="showCreate.set(true)"></button>
            <button pButton type="button" icon="pi pi-refresh" severity="secondary" label="Refresh" (click)="load()"></button>
          </div>
        </div>
      </div>

      <lorne-owner-list [owners]="owners()" />

      <p-dialog
        header="Add portfolio owner"
        [modal]="true"
        [visible]="showCreate()"
        [style]="{ width: 'min(42rem, 92vw)' }"
        (visibleChange)="showCreate.set($event)"
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
            <button pButton type="button" severity="secondary" label="Cancel" (click)="showCreate.set(false)"></button>
            <button pButton type="submit" icon="pi pi-plus" [loading]="saving()" label="Create owner"></button>
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
  protected form: CreatePropertyOwnerRequest = this.blankForm();

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.owners.set(await firstValueFrom(this.propertyOwnerService.list()));
  }

  async create(): Promise<void> {
    if (!this.form.displayName?.trim()) {
      return;
    }
    this.saving.set(true);
    try {
      const owner = await firstValueFrom(this.propertyOwnerService.create(this.form));
      this.owners.update((owners) => [owner, ...owners]);
      this.form = this.blankForm();
      this.showCreate.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  private blankForm(): CreatePropertyOwnerRequest {
    return { displayName: '', email: '', phone: '', billingEmail: '', notes: '' };
  }
}
