import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { AssetCatalog, TenantAsset } from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { AssetListComponent } from './asset-list.component';

@Component({
  selector: 'lorne-tools-equipment-panel',
  standalone: true,
  imports: [AssetListComponent, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-2">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Tools" severity="warn" />
            <h2 class="text-lg font-bold text-slate-950">Tools and equipment</h2>
            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{{ catalog().assets.length }} records</span>
          </div>
          <button pButton type="button" icon="pi pi-briefcase" label="Add equipment" (click)="addAsset.emit()"></button>
        </div>
      </div>
      <lorne-asset-list
        [assets]="catalog().assets"
        (updateAsset)="updateAsset.emit($event)"
        (assignWorker)="assignWorker.emit($event)"
        (updateAssetStatus)="updateAssetStatus.emit($event)"
        (deleteAsset)="deleteAsset.emit($event)"
      />
    </section>
  `
})
export class ToolsEquipmentPanelComponent {
  readonly catalog = input.required<AssetCatalog>();
  readonly addAsset = output<void>();
  readonly updateAsset = output<TenantAsset>();
  readonly assignWorker = output<TenantAsset>();
  readonly updateAssetStatus = output<{ asset: TenantAsset; active: boolean }>();
  readonly deleteAsset = output<TenantAsset>();
}
