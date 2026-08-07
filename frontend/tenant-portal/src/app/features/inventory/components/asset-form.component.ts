import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { CreateAssetRequest, WorkerOption } from '@lorne/contracts';

@Component({
  selector: 'lorne-asset-form',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputNumberModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="space-y-4" (ngSubmit)="submit()">
      <div>
        <p class="text-xs font-bold uppercase tracking-wide text-amber-700">Tool / equipment</p>
        <h2 class="mt-1 text-xl font-bold text-slate-950">Assign equipment</h2>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Type</span>
        <select class="w-full border border-slate-300 px-3 py-2" name="assetType" [(ngModel)]="form.assetType">
          <option value="TOOL">Tool</option>
          <option value="EQUIPMENT">Equipment</option>
          <option value="VEHICLE">Vehicle</option>
          <option value="DEVICE">Device</option>
        </select>
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Name</span>
        <input pInputText class="w-full" name="assetName" required [(ngModel)]="form.name" />
      </label>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Identifier</span>
        <input pInputText class="w-full" name="identifier" [(ngModel)]="form.identifier" />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Qty</span>
          <p-inputnumber styleClass="w-full" inputStyleClass="w-full" name="quantityOnHand" [min]="0" [minFractionDigits]="0" [maxFractionDigits]="2" [(ngModel)]="form.quantityOnHand" />
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-semibold text-slate-700">Location</span>
          <input pInputText class="w-full" name="storageLocation" placeholder="Warehouse, truck, locker..." [(ngModel)]="form.storageLocation" />
        </label>
      </div>
      <label class="block">
        <span class="mb-1 block text-sm font-semibold text-slate-700">Assigned worker</span>
        <select class="w-full border border-slate-300 px-3 py-2" name="assignedWorkerId" [(ngModel)]="form.assignedWorkerId">
          <option value="">Unassigned</option>
          @for (worker of workers(); track worker.id) {
            <option [value]="worker.id">{{ worker.displayName }}{{ worker.employeeNumber ? ' · ' + worker.employeeNumber : '' }}</option>
          }
        </select>
      </label>
      <button pButton type="submit" class="w-full" icon="pi pi-plus" [loading]="saving()" label="Add equipment"></button>
    </form>
  `
})
export class AssetFormComponent {
  readonly workers = input.required<WorkerOption[]>();
  readonly saving = input(false);
  readonly createAsset = output<CreateAssetRequest>();
  protected form: CreateAssetRequest = this.blankForm();

  submit(): void {
    if (!this.form.name.trim() || !this.form.assetType.trim() || this.saving()) {
      return;
    }
    this.createAsset.emit({
      assetType: this.form.assetType,
      name: this.form.name.trim(),
      identifier: this.form.identifier?.trim() || undefined,
      quantityOnHand: this.form.quantityOnHand ?? 1,
      storageLocation: this.form.storageLocation?.trim() || undefined,
      assignedWorkerId: this.form.assignedWorkerId || undefined
    });
  }

  reset(): void {
    this.form = this.blankForm();
  }

  private blankForm(): CreateAssetRequest {
    return { assetType: 'TOOL', name: '', identifier: '', quantityOnHand: 1, storageLocation: '', assignedWorkerId: '' };
  }
}
