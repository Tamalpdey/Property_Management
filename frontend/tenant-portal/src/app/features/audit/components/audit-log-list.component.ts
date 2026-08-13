import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AuditLogRecord } from '@lorne/contracts';
import { TagModule } from 'primeng/tag';
import { DenseCollectionFooterComponent } from '../../../shared/collection/dense-collection-footer.component';
import { DenseCollectionState } from '../../../shared/collection/dense-collection-state';
import { DenseCollectionToolbarComponent } from '../../../shared/collection/dense-collection-toolbar.component';

@Component({
  selector: 'lorne-audit-log-list',
  standalone: true,
  imports: [DatePipe, DenseCollectionFooterComponent, DenseCollectionToolbarComponent, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      <lorne-dense-collection-toolbar
        placeholder="Search audit by actor, action, resource, metadata..."
        [query]="collection.query()"
        [totalCount]="logs().length"
        [filteredCount]="collection.filtered().length"
        [selectedCount]="collection.selectedCount()"
        [sortKey]="collection.sortKey()"
        [sortOptions]="collection.sortOptions"
        (queryChange)="collection.setQuery($event)"
        (sortKeyChange)="collection.setSort($event)"
        (clearSelection)="collection.clearSelection()"
      />

      <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full min-w-[76rem] border-collapse text-sm">
            <thead class="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th class="w-10 px-3 py-3"></th>
                <th class="px-3 py-3">Time</th>
                <th class="px-3 py-3">Actor</th>
                <th class="px-3 py-3">Action</th>
                <th class="px-3 py-3">Resource</th>
                <th class="px-3 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              @for (log of collection.page(); track log.id) {
                <tr class="hover:bg-slate-50">
                  <td class="px-3 py-3">
                    <input type="checkbox" class="h-4 w-4" [checked]="collection.isSelected(log)" (change)="collection.toggle(log)" />
                  </td>
                  <td class="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">{{ log.createdAt | date:'MMM d, h:mm a' }}</td>
                  <td class="px-3 py-3">
                    <p class="font-bold text-slate-950">{{ log.actorName || 'System' }}</p>
                    <p class="text-xs text-slate-500">{{ log.actorEmail || 'No actor email' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    <p-tag [value]="actionLabel(log.action)" [severity]="actionSeverity(log.action)" />
                  </td>
                  <td class="px-3 py-3">
                    <p class="font-semibold text-slate-700">{{ resourceLabel(log.resourceType) }}</p>
                    <p class="max-w-48 truncate text-xs text-slate-500">{{ log.resourceId || 'No resource id' }}</p>
                  </td>
                  <td class="px-3 py-3">
                    <div class="flex max-w-xl flex-wrap gap-1">
                      @for (entry of metadataEntries(log); track entry.key) {
                        <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{{ entry.key }}: {{ entry.value }}</span>
                      } @empty {
                        <span class="text-xs font-semibold text-slate-500">No metadata</span>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-3 py-10 text-center text-sm font-semibold text-slate-500">No audit activity yet.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <lorne-dense-collection-footer
        [filteredCount]="collection.filtered().length"
        [pageIndex]="collection.pageIndex()"
        [pageCount]="collection.pageCount()"
        [pageSize]="collection.pageSize()"
        (pageSizeChange)="collection.setPageSize($event)"
        (previousPage)="collection.previousPage()"
        (nextPage)="collection.nextPage()"
      />
    </div>
  `
})
export class AuditLogListComponent {
  readonly logs = input.required<AuditLogRecord[]>();
  protected readonly collection = new DenseCollectionState<AuditLogRecord>(
    this.logs,
    (log) => log.id,
    (log) => [
      log.action,
      log.resourceType,
      log.resourceId,
      log.actorName,
      log.actorEmail,
      JSON.stringify(log.metadata)
    ].filter(Boolean).join(' '),
    [
      { label: 'Newest first', value: 'created-desc', compare: (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() },
      { label: 'Oldest first', value: 'created-asc', compare: (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() },
      { label: 'Action A-Z', value: 'action-asc', compare: (left, right) => left.action.localeCompare(right.action) },
      { label: 'Resource A-Z', value: 'resource-asc', compare: (left, right) => left.resourceType.localeCompare(right.resourceType) },
      { label: 'Actor A-Z', value: 'actor-asc', compare: (left, right) => (left.actorName ?? '').localeCompare(right.actorName ?? '') }
    ]
  );

  protected actionLabel(action: string): string {
    return action.toLowerCase().replaceAll('_', ' ');
  }

  protected resourceLabel(resourceType: string): string {
    return resourceType.toLowerCase().replaceAll('_', ' ');
  }

  protected actionSeverity(action: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (action.includes('DEACTIVATED') || action.includes('CANCELLED')) {
      return 'danger';
    }
    if (action.includes('UPDATED')) {
      return 'warn';
    }
    if (action.includes('CREATED')) {
      return 'success';
    }
    return 'info';
  }

  protected metadataEntries(log: AuditLogRecord): Array<{ key: string; value: string }> {
    return Object.entries(log.metadata ?? {})
      .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
      .slice(0, 5)
      .map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value) }));
  }
}
