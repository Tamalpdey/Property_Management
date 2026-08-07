import { Signal, computed, signal } from '@angular/core';

export interface DenseSortOption<T> {
  label: string;
  value: string;
  compare: (left: T, right: T) => number;
}

export class DenseCollectionState<T> {
  readonly query = signal('');
  readonly pageSize = signal(25);
  readonly pageIndex = signal(0);
  readonly sortKey = signal('');
  readonly selectedIds = signal(new Set<string>());

  readonly filtered = computed(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return this.items();
    }
    return this.items().filter((item) => this.searchText(item).toLowerCase().includes(term));
  });

  readonly sorted = computed(() => {
    const option = this.sortOptions.find((candidate) => candidate.value === this.sortKey());
    return option ? [...this.filtered()].sort(option.compare) : this.filtered();
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.sorted().length / this.pageSize())));
  readonly page = computed(() => {
    const start = this.pageIndex() * this.pageSize();
    return this.sorted().slice(start, start + this.pageSize());
  });
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly allPageSelected = computed(() => this.page().length > 0 && this.page().every((item) => this.selectedIds().has(this.id(item))));

  constructor(
    private readonly items: Signal<T[]>,
    private readonly id: (item: T) => string,
    private readonly searchText: (item: T) => string,
    readonly sortOptions: DenseSortOption<T>[]
  ) {
    this.sortKey.set(sortOptions[0]?.value ?? '');
  }

  setQuery(query: string): void {
    this.query.set(query);
    this.pageIndex.set(0);
    this.selectedIds.set(new Set());
  }

  setSort(sortKey: string): void {
    this.sortKey.set(sortKey);
    this.pageIndex.set(0);
  }

  setPageSize(pageSize: number): void {
    this.pageSize.set(pageSize);
    this.pageIndex.set(0);
  }

  previousPage(): void {
    this.pageIndex.update((page) => Math.max(0, page - 1));
  }

  nextPage(): void {
    this.pageIndex.update((page) => Math.min(this.pageCount() - 1, page + 1));
  }

  toggle(item: T): void {
    const itemId = this.id(item);
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  togglePage(): void {
    const page = this.page();
    const allSelected = this.allPageSelected();
    this.selectedIds.update((current) => {
      const next = new Set(current);
      for (const item of page) {
        const itemId = this.id(item);
        if (allSelected) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
      }
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  isSelected(item: T): boolean {
    return this.selectedIds().has(this.id(item));
  }
}
