import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

export interface DenseToolbarSortOption {
  label: string;
  value: string;
}

@Component({
  selector: 'lorne-dense-collection-toolbar',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm">
      <div class="grid gap-1.5 xl:grid-cols-[1fr_auto_auto] xl:items-center">
        <input
          pInputText
          class="w-full"
          name="collectionSearch"
          [placeholder]="placeholder()"
          [ngModel]="query()"
          (ngModelChange)="queryChange.emit($event)"
        />

        <div class="flex flex-wrap items-center gap-1.5">
          <select class="rounded-lg border border-slate-300 px-2 py-1 text-[0.9rem] font-semibold text-slate-700" [ngModel]="sortKey()" (ngModelChange)="sortKeyChange.emit($event)">
            @for (option of sortOptions(); track option.value) {
              <option [value]="option.value">{{ option.label }}</option>
            }
          </select>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-1.5 xl:justify-end">
          <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{{ filteredCount() }} / {{ totalCount() }}</span>
          <button pButton type="button" size="small" severity="secondary" icon="pi pi-check-square" [label]="selectedCount() + ' selected'" [disabled]="selectedCount() === 0"></button>
          <button pButton type="button" size="small" severity="secondary" icon="pi pi-download" label="Export" [disabled]="selectedCount() === 0" (click)="bulkExport.emit()"></button>
          <button pButton type="button" size="small" severity="secondary" icon="pi pi-times" [disabled]="selectedCount() === 0" (click)="clearSelection.emit()"></button>
        </div>
      </div>
    </div>
  `
})
export class DenseCollectionToolbarComponent {
  readonly query = input('');
  readonly placeholder = input('Search...');
  readonly totalCount = input(0);
  readonly filteredCount = input(0);
  readonly selectedCount = input(0);
  readonly sortKey = input('');
  readonly sortOptions = input.required<DenseToolbarSortOption[]>();

  readonly queryChange = output<string>();
  readonly sortKeyChange = output<string>();
  readonly clearSelection = output<void>();
  readonly bulkExport = output<void>();
}
