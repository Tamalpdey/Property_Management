import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SuperAdminOverviewResponse } from '@lorne/contracts';
import { TagModule } from 'primeng/tag';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'lorne-admin-action-list',
  standalone: true,
  imports: [TagModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="border-t border-slate-200 pt-5">
      <div>
        <p class="text-xs font-medium text-slate-500">
          Control queue
        </p>
        <h2 class="mt-1 text-base font-semibold text-slate-950">Priority actions</h2>
      </div>
      <div class="mt-4 grid gap-3">
        @for (action of actions(); track action.label) {
          <a
            [routerLink]="action.path.split('?')[0]"
            [queryParams]="actionParams(action.path)"
            class="block border-b border-slate-200 py-4 no-underline"
          >
            <div class="flex items-start justify-between gap-3">
              <p class="font-semibold text-slate-950">{{ action.label }}</p>
              <p-tag [severity]="action.severity" [value]="action.severity" />
            </div>
            <p class="mt-2 text-sm leading-6 text-slate-600">
              {{ action.description }}
            </p>
          </a>
        }
        @if (!actions().length) {
          <p class="py-4 text-sm text-slate-500">
            No tenant setup issues found.
          </p>
        }
      </div>
    </section>
  `
})
export class AdminActionListComponent {
  readonly actions =
    input.required<SuperAdminOverviewResponse['priorityActions']>();
  protected actionParams(path: string): Record<string, string> {
    const params: Record<string, string> = {};
    new URLSearchParams(path.split('?')[1] || '').forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }
}
