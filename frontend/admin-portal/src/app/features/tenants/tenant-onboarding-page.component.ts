import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  CreateTenantOnboardingRequest,
  SuperAdminTenantSummary,
  TenantOnboardingResult
} from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { SuperAdminTenantService } from './services/super-admin-tenant.service';

@Component({
  selector: 'lorne-tenant-onboarding-page',
  standalone: true,
  imports: [ButtonModule, FormsModule, InputTextModule, PasswordModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-6">
      <header class="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm md:p-6">
        <div class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p class="text-xs font-bold uppercase tracking-wide text-cyan-300">Tenant operations</p>
            <h1 class="mt-2 text-3xl font-bold">Onboard a tenant</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Provision the organization, first administrator, portal identity, and starter branding in one controlled workflow.
            </p>
          </div>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div class="rounded border border-white/15 bg-white/5 px-4 py-3">
              <span class="block text-xs font-bold uppercase text-slate-400">Tenants</span>
              <strong class="mt-1 block text-xl">{{ tenants().length }}</strong>
            </div>
            <div class="rounded border border-white/15 bg-white/5 px-4 py-3">
              <span class="block text-xs font-bold uppercase text-slate-400">Active</span>
              <strong class="mt-1 block text-xl">{{ activeTenantCount() }}</strong>
            </div>
          </div>
        </div>
      </header>

      <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div class="border-b border-slate-200 p-5">
            <div class="grid grid-cols-3 gap-2" aria-label="Tenant onboarding progress">
              @for (item of steps; track item.number) {
                <button
                  type="button"
                  class="min-w-0 border-b-2 px-2 pb-3 text-left"
                  [class.border-slate-950]="step() === item.number"
                  [class.border-emerald-500]="step() > item.number"
                  [class.border-slate-200]="step() < item.number"
                  (click)="goToStep(item.number)"
                >
                  <span class="block text-xs font-bold uppercase text-slate-500">Step {{ item.number }}</span>
                  <span class="mt-1 block truncate text-sm font-bold text-slate-900">{{ item.label }}</span>
                </button>
              }
            </div>
          </div>

          <form class="p-5 md:p-6" (ngSubmit)="submit()">
            @if (step() === 1) {
              <div>
                <h2 class="text-xl font-bold text-slate-950">Organization and access</h2>
                <p class="mt-1 text-sm text-slate-600">Set the tenant identity and the routing key used by both portals.</p>
                <div class="mt-6 grid gap-4 md:grid-cols-2">
                  <label class="field md:col-span-2">
                    <span>Display name <b>*</b></span>
                    <input pInputText name="displayName" [(ngModel)]="form.displayName" (ngModelChange)="suggestSubdomain($event)" required />
                  </label>
                  <label class="field md:col-span-2">
                    <span>Legal company name <b>*</b></span>
                    <input pInputText name="legalName" [(ngModel)]="form.legalName" required />
                  </label>
                  <label class="field md:col-span-2">
                    <span>Portal subdomain <b>*</b></span>
                    <div class="flex rounded-md border border-slate-300 bg-white focus-within:border-slate-700">
                      <input
                        class="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 outline-none"
                        name="portalSubdomain"
                        [(ngModel)]="form.portalSubdomain"
                        (ngModelChange)="subdomainEdited = true"
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        required
                      />
                      <span class="grid place-items-center border-l border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-500">.app.{{ rootDomain() }}</span>
                    </div>
                    <small>Lowercase letters, numbers, and hyphens. This must be unique.</small>
                  </label>
                  <label class="field">
                    <span>Plan <b>*</b></span>
                    <select name="planCode" [(ngModel)]="form.planCode">
                      <option value="starter">Starter</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Starting status <b>*</b></span>
                    <select name="status" [(ngModel)]="form.status">
                      <option value="TRIAL">Trial</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Timezone <b>*</b></span>
                    <select name="timezone" [(ngModel)]="form.timezone">
                      <option value="America/Toronto">Eastern - Toronto</option>
                      <option value="America/Winnipeg">Central - Winnipeg</option>
                      <option value="America/Edmonton">Mountain - Edmonton</option>
                      <option value="America/Vancouver">Pacific - Vancouver</option>
                      <option value="America/Halifax">Atlantic - Halifax</option>
                      <option value="America/St_Johns">Newfoundland - St. John's</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Country <b>*</b></span>
                    <select name="countryCode" [(ngModel)]="form.countryCode">
                      <option value="CA">Canada</option>
                      <option value="US">United States</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>Province / state</span>
                    <input pInputText name="provinceCode" [(ngModel)]="form.provinceCode" placeholder="ON" />
                  </label>
                </div>
              </div>
            }

            @if (step() === 2) {
              <div>
                <h2 class="text-xl font-bold text-slate-950">Administrator and company profile</h2>
                <p class="mt-1 text-sm text-slate-600">Create the first tenant administrator and seed client-facing contact details.</p>
                <div class="mt-6 grid gap-4 md:grid-cols-2">
                  <label class="field">
                    <span>Administrator name <b>*</b></span>
                    <input pInputText name="adminDisplayName" [(ngModel)]="form.adminDisplayName" required />
                  </label>
                  <label class="field">
                    <span>Administrator email <b>*</b></span>
                    <input pInputText type="email" name="adminEmail" [(ngModel)]="form.adminEmail" required />
                  </label>
                  <label class="field">
                    <span>Administrator phone</span>
                    <input pInputText type="tel" name="adminPhone" [(ngModel)]="form.adminPhone" />
                  </label>
                  <label class="field">
                    <span>Temporary password <b>*</b></span>
                    <div class="flex gap-2">
                      <p-password
                        styleClass="min-w-0 flex-1"
                        inputStyleClass="w-full"
                        name="temporaryPassword"
                        [feedback]="false"
                        [toggleMask]="true"
                        [(ngModel)]="form.temporaryPassword"
                      />
                      <button pButton type="button" severity="secondary" icon="pi pi-refresh" title="Generate password" (click)="generatePassword()"></button>
                    </div>
                    <small>At least 8 characters. Share it through a secure channel.</small>
                  </label>
                  <label class="field">
                    <span>Billing email</span>
                    <input pInputText type="email" name="billingEmail" [(ngModel)]="form.billingEmail" />
                  </label>
                  <label class="field">
                    <span>Support email</span>
                    <input pInputText type="email" name="supportEmail" [(ngModel)]="form.supportEmail" />
                  </label>
                  <label class="field">
                    <span>Company phone</span>
                    <input pInputText type="tel" name="companyPhone" [(ngModel)]="form.companyPhone" />
                  </label>
                  <label class="field">
                    <span>Website</span>
                    <input pInputText type="url" name="websiteUrl" [(ngModel)]="form.websiteUrl" placeholder="https://" />
                  </label>
                  <label class="field md:col-span-2">
                    <span>Street address</span>
                    <input pInputText name="addressLine1" [(ngModel)]="form.addressLine1" />
                  </label>
                  <label class="field">
                    <span>Unit / suite</span>
                    <input pInputText name="addressLine2" [(ngModel)]="form.addressLine2" />
                  </label>
                  <label class="field">
                    <span>City</span>
                    <input pInputText name="city" [(ngModel)]="form.city" />
                  </label>
                  <label class="field">
                    <span>Postal / ZIP code</span>
                    <input pInputText name="postalCode" [(ngModel)]="form.postalCode" />
                  </label>
                </div>
              </div>
            }

            @if (step() === 3) {
              <div>
                <h2 class="text-xl font-bold text-slate-950">Brand starter and review</h2>
                <p class="mt-1 text-sm text-slate-600">Give the tenant a useful starting identity. They can refine it later in tenant settings.</p>
                <div class="mt-6 grid gap-4 md:grid-cols-3">
                  <label class="field">
                    <span>Primary</span>
                    <div class="color-input"><input type="color" name="primaryPicker" [(ngModel)]="form.themePrimaryColor" /><input pInputText name="themePrimaryColor" [(ngModel)]="form.themePrimaryColor" /></div>
                  </label>
                  <label class="field">
                    <span>Accent</span>
                    <div class="color-input"><input type="color" name="accentPicker" [(ngModel)]="form.themeAccentColor" /><input pInputText name="themeAccentColor" [(ngModel)]="form.themeAccentColor" /></div>
                  </label>
                  <label class="field">
                    <span>Navigation</span>
                    <div class="color-input"><input type="color" name="navigationPicker" [(ngModel)]="form.themeNavigationColor" /><input pInputText name="themeNavigationColor" [(ngModel)]="form.themeNavigationColor" /></div>
                  </label>
                  <label class="field md:col-span-3">
                    <span>Login headline</span>
                    <input pInputText name="loginHeadline" [(ngModel)]="form.loginHeadline" />
                  </label>
                  <label class="field md:col-span-3">
                    <span>Login message</span>
                    <textarea name="loginMessage" [(ngModel)]="form.loginMessage" rows="3"></textarea>
                  </label>
                </div>

                <div class="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  <div><span class="review-label">Organization</span><strong>{{ form.displayName || 'Not provided' }}</strong><small>{{ form.legalName }}</small></div>
                  <div><span class="review-label">Administrator</span><strong>{{ form.adminDisplayName || 'Not provided' }}</strong><small>{{ form.adminEmail }}</small></div>
                  <div><span class="review-label">Tenant portal</span><strong>{{ portalHost('app') }}</strong><small>{{ form.planCode }} · {{ form.status }}</small></div>
                  <div><span class="review-label">Worker portal</span><strong>{{ portalHost('worker') }}</strong><small>{{ form.timezone }}</small></div>
                </div>
                <label class="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  <input class="mt-1 h-4 w-4" type="checkbox" name="confirmed" [(ngModel)]="confirmed" />
                  <span>I verified the tenant identity, unique portal name, administrator email, and temporary credential.</span>
                </label>
              </div>
            }

            @if (error()) {
              <div class="mt-5 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <i class="pi pi-exclamation-circle mt-0.5"></i><span>{{ error() }}</span>
              </div>
            }

            <div class="mt-7 flex items-center justify-between border-t border-slate-200 pt-5">
              <button pButton type="button" severity="secondary" icon="pi pi-arrow-left" label="Back" [disabled]="step() === 1 || saving()" (click)="previous()"></button>
              @if (step() < 3) {
                <button pButton type="button" icon="pi pi-arrow-right" iconPos="right" label="Continue" (click)="next()"></button>
              } @else {
                <button pButton type="submit" icon="pi pi-building" label="Create tenant" [loading]="saving()" [disabled]="saving() || !confirmed"></button>
              }
            </div>
          </form>
        </div>

        <aside class="space-y-4">
          <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div class="p-4 text-white" [style.background]="form.themeNavigationColor">
              <div class="flex items-center gap-3">
                <span class="grid h-10 w-10 place-items-center rounded bg-white/95 font-bold" [style.color]="form.themePrimaryColor">{{ tenantInitials() }}</span>
                <div class="min-w-0">
                  <strong class="block truncate">{{ form.displayName || 'Tenant name' }}</strong>
                  <small class="text-white/70">Operations workspace</small>
                </div>
              </div>
            </div>
            <div class="p-4">
              <p class="text-xs font-bold uppercase text-slate-500">Live starter preview</p>
              <h3 class="mt-3 text-xl font-bold text-slate-950">{{ form.loginHeadline }}</h3>
              <p class="mt-1 text-sm leading-5 text-slate-600">{{ form.loginMessage }}</p>
              <button class="mt-5 w-full rounded px-3 py-2 text-sm font-bold text-white" type="button" [style.background]="form.themePrimaryColor">Sign in</button>
              <div class="mt-4 h-1 rounded" [style.background]="form.themeAccentColor"></div>
            </div>
          </div>

          @if (created(); as result) {
            <div class="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
              <div class="flex items-center gap-2 text-emerald-800"><i class="pi pi-check-circle"></i><strong>Tenant is ready</strong></div>
              <p class="mt-2 text-sm leading-5 text-emerald-900">{{ result.displayName }} and its first administrator were created successfully.</p>
              <dl class="mt-4 space-y-3 text-sm">
                <div><dt>Tenant portal</dt><dd>{{ portalHost('app', result.portalSubdomain) }}</dd></div>
                <div><dt>Worker portal</dt><dd>{{ portalHost('worker', result.portalSubdomain) }}</dd></div>
                <div><dt>Administrator</dt><dd>{{ result.administratorEmail }}</dd></div>
              </dl>
              <div class="mt-4 grid gap-2">
                <button pButton type="button" size="small" severity="secondary" icon="pi pi-copy" label="Copy handoff" (click)="copyHandoff(result)"></button>
                <button pButton type="button" size="small" icon="pi pi-plus" label="Onboard another" (click)="reset()"></button>
              </div>
            </div>
          } @else {
            <div class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p class="text-xs font-bold uppercase text-slate-500">Provisioning includes</p>
              <ul class="mt-3 space-y-3 text-sm text-slate-700">
                <li><i class="pi pi-check text-emerald-600"></i> Tenant and regional defaults</li>
                <li><i class="pi pi-check text-emerald-600"></i> Branded tenant and worker routes</li>
                <li><i class="pi pi-check text-emerald-600"></i> First tenant administrator</li>
                <li><i class="pi pi-check text-emerald-600"></i> Company profile and login starter</li>
                <li><i class="pi pi-check text-emerald-600"></i> Audit record of provisioning</li>
              </ul>
            </div>
          }
        </aside>
      </div>

      <div class="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-xs font-bold uppercase text-slate-500">Tenant directory</p>
            <h2 class="mt-1 text-xl font-bold text-slate-950">Provisioned organizations</h2>
          </div>
          <label class="relative block md:w-80">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input pInputText class="w-full pl-9" name="search" [(ngModel)]="search" placeholder="Search tenants or administrators" />
          </label>
        </div>
        @if (loadingTenants()) {
          <p class="p-6 text-sm text-slate-500">Loading tenants...</p>
        } @else if (filteredTenants().length === 0) {
          <p class="p-6 text-sm text-slate-500">No tenants match this search.</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                <tr><th>Tenant</th><th>Portal</th><th>Administrator</th><th>Usage</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                @for (tenant of filteredTenants(); track tenant.id) {
                  <tr>
                    <td><strong>{{ tenant.displayName }}</strong><small>{{ tenant.legalName }}</small></td>
                    <td><strong>{{ tenant.portalSubdomain }}</strong><small>{{ tenant.planCode }} · {{ tenant.timezone }}</small></td>
                    <td>{{ tenant.administratorEmail || 'Not assigned' }}</td>
                    <td><strong>{{ tenant.activeUsers }}</strong> users · <strong>{{ tenant.activeProperties }}</strong> properties</td>
                    <td><p-tag [value]="tenant.status" [severity]="tenant.status === 'ACTIVE' ? 'success' : 'warn'" /></td>
                    <td>{{ formatDate(tenant.createdAt) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .field { display: grid; gap: .42rem; min-width: 0; }
    .field > span { font-size: .82rem; font-weight: 750; color: #334155; }
    .field b { color: #dc2626; }
    .field small { color: #64748b; font-size: .72rem; line-height: 1.35; }
    .field input:not([type='color']), .field select, .field textarea { width: 100%; box-sizing: border-box; }
    .field select, .field textarea { border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: .68rem .75rem; color: #172033; outline: none; }
    .field select:focus, .field textarea:focus { border-color: #334155; box-shadow: 0 0 0 1px #334155; }
    .color-input { display: grid; grid-template-columns: 2.7rem 1fr; gap: .5rem; }
    .color-input input[type='color'] { width: 2.7rem; height: 2.7rem; padding: .15rem; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; }
    .review-label { display: block; margin-bottom: .3rem; color: #64748b; font-size: .68rem; font-weight: 800; text-transform: uppercase; }
    .review-label + strong, .review-label + strong + small { display: block; overflow-wrap: anywhere; }
    aside dt { color: #64748b; font-size: .7rem; font-weight: 800; text-transform: uppercase; }
    aside dd { margin: .2rem 0 0; color: #064e3b; font-weight: 700; overflow-wrap: anywhere; }
    aside li { display: flex; gap: .55rem; align-items: center; }
    th { padding: .8rem 1rem; font-weight: 800; }
    td { padding: .9rem 1rem; color: #475569; vertical-align: middle; }
    td strong, td small { display: block; }
    td strong { color: #172033; }
    td small { margin-top: .18rem; color: #64748b; }
  `
})
export class TenantOnboardingPageComponent {
  private readonly tenantService = inject(SuperAdminTenantService);

  protected readonly steps = [
    { number: 1, label: 'Organization' },
    { number: 2, label: 'Administrator' },
    { number: 3, label: 'Brand and review' }
  ] as const;
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly saving = signal(false);
  protected readonly loadingTenants = signal(true);
  protected readonly error = signal('');
  protected readonly created = signal<TenantOnboardingResult | null>(null);
  protected readonly tenants = signal<SuperAdminTenantSummary[]>([]);
  protected readonly activeTenantCount = computed(() => this.tenants().filter((tenant) => tenant.status === 'ACTIVE').length);
  protected search = '';
  protected confirmed = false;
  protected subdomainEdited = false;
  protected form = this.emptyForm();

  constructor() {
    void this.loadTenants();
  }

  protected suggestSubdomain(value: string): void {
    if (this.subdomainEdited) return;
    this.form.portalSubdomain = this.slugify(value);
    if (!this.form.legalName) this.form.legalName = value;
  }

  protected next(): void {
    this.error.set('');
    const message = this.validateStep(this.step());
    if (message) {
      this.error.set(message);
      return;
    }
    this.step.update((value) => Math.min(3, value + 1) as 1 | 2 | 3);
  }

  protected previous(): void {
    this.error.set('');
    this.step.update((value) => Math.max(1, value - 1) as 1 | 2 | 3);
  }

  protected goToStep(target: 1 | 2 | 3): void {
    if (target <= this.step()) this.step.set(target);
  }

  protected generatePassword(): void {
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    this.form.temporaryPassword = `T!${Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('')}`;
  }

  protected async submit(): Promise<void> {
    if (this.saving()) return;
    const invalidStep = ([1, 2, 3] as const).find((item) => this.validateStep(item));
    if (invalidStep) {
      this.step.set(invalidStep);
      this.error.set(this.validateStep(invalidStep));
      return;
    }
    if (!this.confirmed) {
      this.error.set('Confirm the onboarding details before creating the tenant.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.tenantService.create(this.form));
      this.created.set(result);
      await this.loadTenants();
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected reset(): void {
    this.form = this.emptyForm();
    this.subdomainEdited = false;
    this.confirmed = false;
    this.error.set('');
    this.created.set(null);
    this.step.set(1);
  }

  protected filteredTenants(): SuperAdminTenantSummary[] {
    const term = this.search.trim().toLowerCase();
    if (!term) return this.tenants();
    return this.tenants().filter((tenant) =>
      [tenant.displayName, tenant.legalName, tenant.portalSubdomain, tenant.administratorEmail, tenant.planCode]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }

  protected portalHost(surface: 'app' | 'worker', subdomain = this.form.portalSubdomain): string {
    return `${subdomain || 'tenant'}.${surface}.${this.rootDomain()}`;
  }

  protected rootDomain(): string {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.localhost')) return 'yourproduct.com';
    const parts = hostname.split('.');
    return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
  }

  protected tenantInitials(): string {
    const name = this.form.displayName.trim();
    if (!name) return 'T';
    return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
  }

  protected async copyHandoff(result: TenantOnboardingResult): Promise<void> {
    const handoff = [
      `Tenant: ${result.displayName}`,
      `Tenant portal: https://${this.portalHost('app', result.portalSubdomain)}`,
      `Worker portal: https://${this.portalHost('worker', result.portalSubdomain)}`,
      `Administrator: ${result.administratorEmail}`,
      `Temporary password: ${this.form.temporaryPassword}`
    ].join('\n');
    await navigator.clipboard.writeText(handoff);
  }

  private async loadTenants(): Promise<void> {
    this.loadingTenants.set(true);
    try {
      this.tenants.set(await firstValueFrom(this.tenantService.list()));
    } catch (error) {
      this.error.set(this.errorMessage(error));
    } finally {
      this.loadingTenants.set(false);
    }
  }

  private validateStep(step: 1 | 2 | 3): string {
    if (step === 1) {
      if (!this.form.displayName.trim() || !this.form.legalName.trim()) return 'Display name and legal company name are required.';
      if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(this.form.portalSubdomain)) return 'Enter a valid portal subdomain with lowercase letters, numbers, or hyphens.';
      if (!this.form.timezone || !this.form.countryCode) return 'Timezone and country are required.';
    }
    if (step === 2) {
      if (!this.form.adminDisplayName.trim()) return 'Administrator name is required.';
      if (!/^\S+@\S+\.\S+$/.test(this.form.adminEmail)) return 'Enter a valid administrator email.';
      if (this.form.temporaryPassword.length < 8) return 'Temporary password must be at least 8 characters.';
    }
    if (step === 3) {
      const colors = [this.form.themePrimaryColor, this.form.themeAccentColor, this.form.themeNavigationColor];
      if (colors.some((color) => !/^#[0-9a-f]{6}$/i.test(color || ''))) return 'Brand colors must use six-digit hex values.';
    }
    return '';
  }

  private slugify(value: string): string {
    return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message || error.error?.message || 'Tenant onboarding could not be completed.';
    }
    return 'Tenant onboarding could not be completed.';
  }

  private emptyForm(): CreateTenantOnboardingRequest {
    return {
      legalName: '', displayName: '', portalSubdomain: '', planCode: 'starter', status: 'TRIAL',
      timezone: 'America/Toronto', countryCode: 'CA', provinceCode: 'ON', adminDisplayName: '',
      adminEmail: '', adminPhone: '', temporaryPassword: '', billingEmail: '', supportEmail: '',
      companyPhone: '', websiteUrl: '', addressLine1: '', addressLine2: '', city: '', postalCode: '',
      themePrimaryColor: '#0f766e', themeAccentColor: '#2563eb', themeNavigationColor: '#0f172a',
      loginHeadline: 'Welcome back', loginMessage: 'Access your operations workspace.'
    };
  }
}
