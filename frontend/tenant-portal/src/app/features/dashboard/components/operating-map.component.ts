import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'lorne-operating-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wide text-teal-700">Operating model</p>
          <h2 class="mt-2 text-xl font-bold text-slate-950">Owner, property, service mapping</h2>
        </div>
        <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Tenant scoped</span>
      </div>

      <div class="mt-5 grid gap-3 lg:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-white text-teal-700 shadow-sm"><i class="pi pi-user"></i></span>
            <div>
              <p class="text-sm font-bold text-slate-950">Property owner</p>
              <p class="text-xs font-medium text-slate-500">Contacts, billing, notes</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-white text-blue-700 shadow-sm"><i class="pi pi-building"></i></span>
            <div>
              <p class="text-sm font-bold text-slate-950">Managed property</p>
              <p class="text-xs font-medium text-slate-500">Address, access, service profile</p>
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div class="flex items-center gap-3">
            <span class="grid h-10 w-10 place-items-center rounded-lg bg-white text-amber-700 shadow-sm"><i class="pi pi-wrench"></i></span>
            <div>
              <p class="text-sm font-bold text-slate-950">Maintenance service</p>
              <p class="text-xs font-medium text-slate-500">Plumbing, pool, grounds, repairs</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  `
})
export class OperatingMapComponent {}
