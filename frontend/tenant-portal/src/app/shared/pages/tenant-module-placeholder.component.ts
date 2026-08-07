import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'lorne-tenant-module-placeholder',
  standalone: true,
  imports: [ButtonModule, RouterLink, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0">
            <p-tag [value]="section()" severity="info" />
            <h1 class="mt-1 text-xl font-bold text-slate-950 md:text-2xl">{{ title() }}</h1>
          </div>
          <a pButton routerLink="/dashboard" type="button" severity="secondary" icon="pi pi-arrow-left" label="Dashboard" class="no-underline"></a>
        </div>
      </div>

      <div class="grid gap-3 lg:grid-cols-3">
        @for (capability of capabilities(); track capability) {
          <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p class="text-sm font-bold text-slate-950">{{ capability }}</p>
          </div>
        }
      </div>
    </section>
  `
})
export class TenantModulePlaceholderComponent {
  readonly section = input('Tenant admin');
  readonly title = input('Module');
  readonly summary = input('This area is planned for the tenant operations workspace.');
  readonly capabilities = input<string[]>([]);
}
