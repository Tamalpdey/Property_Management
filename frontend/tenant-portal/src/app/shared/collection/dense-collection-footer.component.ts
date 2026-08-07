import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'lorne-dense-collection-footer',
  standalone: true,
  imports: [ButtonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-2">
        <span class="text-xs font-bold text-slate-500">Rows</span>
        <select class="rounded-lg border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-700" [ngModel]="pageSize()" (ngModelChange)="pageSizeChange.emit(+$event)">
          <option [value]="10">10</option>
          <option [value]="25">25</option>
          <option [value]="50">50</option>
          <option [value]="100">100</option>
        </select>
        <span class="text-xs font-semibold text-slate-500">{{ filteredCount() }} result{{ filteredCount() === 1 ? '' : 's' }}</span>
      </div>

      <div class="flex items-center justify-end gap-2">
        <button pButton type="button" size="small" severity="secondary" icon="pi pi-chevron-left" [disabled]="pageIndex() === 0" (click)="previousPage.emit()"></button>
        <span class="min-w-24 text-center text-xs font-bold text-slate-600">Page {{ pageIndex() + 1 }} / {{ pageCount() }}</span>
        <button pButton type="button" size="small" severity="secondary" icon="pi pi-chevron-right" [disabled]="pageIndex() + 1 >= pageCount()" (click)="nextPage.emit()"></button>
      </div>
    </div>
  `
})
export class DenseCollectionFooterComponent {
  readonly filteredCount = input(0);
  readonly pageIndex = input(0);
  readonly pageCount = input(1);
  readonly pageSize = input(25);

  readonly pageSizeChange = output<number>();
  readonly previousPage = output<void>();
  readonly nextPage = output<void>();
}
