import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { TenantSettingsRecord, UpdateTenantSettingsRequest } from '@lorne/contracts';
import { TenantSettingsService } from './services/tenant-settings.service';

type SettingsTab = 'profile' | 'invoice' | 'email';

@Component({
  selector: 'lorne-tenant-settings-page',
  standalone: true,
  imports: [ButtonModule, FormsModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Administration" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Tenant settings</h1>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="load()"></button>
        </div>
      </div>

      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <section class="grid gap-3 xl:grid-cols-[1fr_24rem]">
        <form class="rounded-lg border border-slate-200 bg-white shadow-sm" (ngSubmit)="save()">
          <div class="border-b border-slate-200 p-3">
            <div class="settings-tabs grid grid-cols-3 rounded-lg border border-slate-200 bg-slate-100 p-1 text-sm font-bold">
              @for (tab of tabs; track tab.key) {
                <button
                  type="button"
                  class="settings-tab"
                  [class.settings-tab-active]="activeTab() === tab.key"
                  (click)="activeTab.set(tab.key)"
                >
                  <i [class]="tab.icon + ' mr-1'"></i>{{ tab.label }}
                </button>
              }
            </div>
          </div>

          <div class="min-h-[31rem] p-3">
            @if (activeTab() === 'profile') {
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="field-label">Organization name</span>
                  <input class="field-input" name="organizationName" [ngModel]="form.organizationName" disabled />
                  <span class="mt-1 block text-xs font-semibold text-slate-500">Managed during tenant onboarding by the super admin.</span>
                </label>
                <label class="block">
                  <span class="field-label">Website</span>
                  <input class="field-input" name="websiteUrl" [(ngModel)]="form.websiteUrl" />
                </label>
                <label class="block">
                  <span class="field-label">Billing email</span>
                  <input class="field-input" name="billingEmail" type="email" [(ngModel)]="form.billingEmail" />
                </label>
                <label class="block">
                  <span class="field-label">Support email</span>
                  <input class="field-input" name="supportEmail" type="email" [(ngModel)]="form.supportEmail" />
                </label>
                <label class="block">
                  <span class="field-label">Phone</span>
                  <input class="field-input" name="phone" [(ngModel)]="form.phone" />
                </label>
                <label class="block">
                  <span class="field-label">Country</span>
                  <input class="field-input" name="countryCode" maxlength="2" [(ngModel)]="form.countryCode" />
                </label>
                <label class="block md:col-span-2">
                  <span class="field-label">Address</span>
                  <input class="field-input" name="addressLine1" [(ngModel)]="form.addressLine1" />
                </label>
                <label class="block">
                  <span class="field-label">City</span>
                  <input class="field-input" name="city" [(ngModel)]="form.city" />
                </label>
                <label class="block">
                  <span class="field-label">Province/state</span>
                  <input class="field-input" name="provinceCode" [(ngModel)]="form.provinceCode" />
                </label>
                <label class="block">
                  <span class="field-label">Postal code</span>
                  <input class="field-input" name="postalCode" [(ngModel)]="form.postalCode" />
                </label>
              </div>
            }

            @if (activeTab() === 'invoice') {
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="field-label">Invoice prefix</span>
                  <input class="field-input uppercase" name="invoicePrefix" maxlength="12" [(ngModel)]="form.invoicePrefix" />
                </label>
                <label class="block md:col-span-2">
                  <span class="field-label">Logo URL</span>
                  <div class="logo-url-row">
                    <input class="field-input" name="logoUrl" placeholder="https://... or upload a logo" [(ngModel)]="form.logoUrl" />
                    <input
                      #logoFileInput
                      class="hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      (change)="selectLogoFile($event)"
                    />
                    <button
                      pButton
                      type="button"
                      severity="secondary"
                      icon="pi pi-upload"
                      label="Upload"
                      [loading]="uploadingLogo()"
                      (click)="logoFileInput.click()"
                    ></button>
                    <button
                      pButton
                      type="button"
                      severity="secondary"
                      icon="pi pi-times"
                      label="Clear"
                      [disabled]="!form.logoUrl || uploadingLogo()"
                      (click)="clearLogo()"
                    ></button>
                  </div>
                  <span class="mt-1 block text-xs font-semibold text-slate-500">Paste a public logo URL or upload PNG, JPG, WEBP, or GIF. Save settings after upload.</span>
                </label>
                <label class="block">
                  <span class="field-label">Primary color</span>
                  <span class="color-control">
                    <input class="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white p-1" name="themePrimaryColorPicker" type="color" [(ngModel)]="form.themePrimaryColor" />
                    <input class="field-input font-mono uppercase" name="themePrimaryColor" maxlength="7" pattern="^#[0-9A-Fa-f]{6}$" [(ngModel)]="form.themePrimaryColor" />
                  </span>
                </label>
                <label class="block">
                  <span class="field-label">Accent color</span>
                  <span class="color-control">
                    <input class="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-300 bg-white p-1" name="themeAccentColorPicker" type="color" [(ngModel)]="form.themeAccentColor" />
                    <input class="field-input font-mono uppercase" name="themeAccentColor" maxlength="7" pattern="^#[0-9A-Fa-f]{6}$" [(ngModel)]="form.themeAccentColor" />
                  </span>
                </label>
                <label class="block md:col-span-2">
                  <span class="field-label">Payment terms</span>
                  <textarea class="field-input min-h-28" name="paymentTerms" [(ngModel)]="form.paymentTerms"></textarea>
                </label>
                <label class="block md:col-span-2">
                  <span class="field-label">Invoice footer</span>
                  <textarea class="field-input min-h-24" name="invoiceFooter" [(ngModel)]="form.invoiceFooter"></textarea>
                </label>
              </div>
            }

            @if (activeTab() === 'email') {
              <div class="grid gap-3 md:grid-cols-2">
                <label class="block">
                  <span class="field-label">Email provider</span>
                  <select class="field-input" name="emailProvider" [(ngModel)]="form.emailProvider">
                    <option value="SYSTEM">Use platform sender</option>
                    <option value="TENANT_SMTP">Use tenant SMTP account</option>
                  </select>
                </label>
                <label class="block">
                  <span class="field-label">Sender name</span>
                  <input class="field-input" name="emailSenderName" [(ngModel)]="form.emailSenderName" />
                </label>
                <label class="block">
                  <span class="field-label">From address</span>
                  <input class="field-input" name="emailFromAddress" type="email" [(ngModel)]="form.emailFromAddress" />
                </label>
                <label class="block">
                  <span class="field-label">Reply-to address</span>
                  <input class="field-input" name="emailReplyToAddress" type="email" [(ngModel)]="form.emailReplyToAddress" />
                </label>
                <label class="block">
                  <span class="field-label">SMTP host</span>
                  <input class="field-input" name="smtpHost" [disabled]="form.emailProvider !== 'TENANT_SMTP'" [(ngModel)]="form.smtpHost" />
                </label>
                <label class="block">
                  <span class="field-label">SMTP port</span>
                  <input class="field-input" name="smtpPort" type="number" [disabled]="form.emailProvider !== 'TENANT_SMTP'" [(ngModel)]="form.smtpPort" />
                </label>
                <label class="block">
                  <span class="field-label">SMTP username</span>
                  <input class="field-input" name="smtpUsername" [disabled]="form.emailProvider !== 'TENANT_SMTP'" [(ngModel)]="form.smtpUsername" />
                </label>
                <label class="block">
                  <span class="field-label">SMTP password</span>
                  <input class="field-input" name="smtpPassword" type="password" [placeholder]="settings()?.smtpPasswordConfigured ? 'Password configured' : ''" [disabled]="form.emailProvider !== 'TENANT_SMTP'" [(ngModel)]="form.smtpPassword" />
                </label>
                <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" name="smtpUseTls" [disabled]="form.emailProvider !== 'TENANT_SMTP'" [(ngModel)]="form.smtpUseTls" />
                  Use TLS / STARTTLS
                </label>
                <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" name="clearSmtpPassword" [disabled]="!settings()?.smtpPasswordConfigured" [(ngModel)]="form.clearSmtpPassword" />
                  Clear saved SMTP password
                </label>
              </div>
            }
          </div>

          <div class="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-3">
            <p class="text-xs font-semibold text-slate-500">Settings affect new invoice PDFs and outgoing owner emails.</p>
            <button pButton type="submit" icon="pi pi-save" label="Save settings" [loading]="saving()"></button>
          </div>
        </form>

        <aside class="space-y-3">
          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Brand preview</p>
            <div class="mt-3 rounded-lg p-4 text-white" [style.background]="form.themePrimaryColor || '#0f766e'">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-lg font-black">{{ brandName() }}</p>
                  <p class="mt-1 break-words text-sm font-semibold opacity-90">{{ form.billingEmail || form.supportEmail || 'billing@example.com' }}</p>
                </div>
                @if (form.logoUrl) {
                  <span class="logo-preview">
                    <img [src]="form.logoUrl" alt="Tenant logo preview" />
                  </span>
                }
              </div>
              <p class="mt-6 inline-flex rounded-md bg-white/15 px-2 py-1 text-xs font-black uppercase">Invoice {{ form.invoicePrefix || 'INV' }}-0001</p>
            </div>
          </div>

          <div class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <p class="text-xs font-black uppercase tracking-wide text-teal-700">Email sender</p>
            <h2 class="mt-1 text-lg font-black text-slate-950">{{ form.emailProvider === 'TENANT_SMTP' ? 'Tenant SMTP' : 'Platform sender' }}</h2>
            <p class="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {{ form.emailProvider === 'TENANT_SMTP'
                ? 'Emails will be sent through this tenant SMTP account once host, port, username, password, and from address are configured.'
                : 'Emails use the platform mail sender, with tenant sender name and reply-to applied where possible.' }}
            </p>
            <div class="mt-3 grid gap-2 text-sm font-bold text-slate-700">
              <span class="rounded-lg bg-slate-50 px-3 py-2">From: {{ form.emailFromAddress || 'platform default' }}</span>
              <span class="rounded-lg bg-slate-50 px-3 py-2">Reply-to: {{ form.emailReplyToAddress || form.supportEmail || 'not set' }}</span>
              <span class="rounded-lg bg-slate-50 px-3 py-2">Password: {{ settings()?.smtpPasswordConfigured ? 'configured' : 'not configured' }}</span>
            </div>
          </div>
        </aside>
      </section>
    </section>
  `,
  styles: [`
    .field-label { display: block; margin-bottom: 0.25rem; font-size: 0.8rem; font-weight: 800; color: #334155; }
    .field-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 0.5rem; padding: 0.62rem 0.75rem; font-size: 0.92rem; color: #0f172a; outline: none; background: #fff; }
    .field-input:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.12); }
    .field-input:disabled { background: #f1f5f9; color: #94a3b8; }
    .color-control { display: flex; align-items: center; gap: 0.5rem; }
    .logo-url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 0.5rem; align-items: center; }
    .logo-preview { display: grid; place-items: center; height: 3.5rem; width: 3.5rem; flex: 0 0 auto; overflow: hidden; border-radius: 0.5rem; background: rgba(255, 255, 255, 0.92); padding: 0.35rem; }
    .logo-preview img { max-height: 100%; max-width: 100%; object-fit: contain; }
    .settings-tab { border-radius: 0.45rem; padding: 0.55rem 0.75rem; color: #64748b; transition: background 140ms ease, color 140ms ease, box-shadow 140ms ease; }
    .settings-tab:hover { color: #0f172a; background: rgba(255, 255, 255, 0.72); }
    .settings-tab-active { background: #0f766e; color: #ffffff; box-shadow: 0 1px 4px rgba(15, 118, 110, 0.24); }
    .settings-tab-active:hover { background: #0f766e; color: #ffffff; }
    @media (max-width: 640px) {
      .logo-url-row { grid-template-columns: 1fr; }
    }
  `]
})
export class TenantSettingsPageComponent {
  private readonly tenantSettingsService = inject(TenantSettingsService);
  protected readonly tabs: Array<{ key: SettingsTab; label: string; icon: string }> = [
    { key: 'profile', label: 'Profile', icon: 'pi pi-building' },
    { key: 'invoice', label: 'Invoice', icon: 'pi pi-file-edit' },
    { key: 'email', label: 'Email', icon: 'pi pi-envelope' }
  ];
  protected readonly activeTab = signal<SettingsTab>('profile');
  protected readonly settings = signal<TenantSettingsRecord | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingLogo = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly form: UpdateTenantSettingsRequest = {};
  protected readonly brandName = computed(() => this.form.organizationName || this.settings()?.tenantName || 'Tenant');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const settings = await firstValueFrom(this.tenantSettingsService.get());
      this.settings.set(settings);
      this.populate(settings);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load tenant settings.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const { organizationName: _organizationName, ...request } = this.form;
      const saved = await firstValueFrom(this.tenantSettingsService.update(request));
      this.settings.set(saved);
      this.populate(saved);
      this.message.set('Tenant settings saved.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to save tenant settings.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async selectLogoFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.uploadingLogo()) {
      return;
    }

    const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
    if (!supportedTypes.has(file.type)) {
      this.error.set('Logo must be a PNG, JPG, WEBP, or GIF image.');
      return;
    }
    if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
      this.error.set('Logo file size must be between 1 byte and 10 MB.');
      return;
    }

    this.uploadingLogo.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const upload = await firstValueFrom(this.tenantSettingsService.logoUploadUrl({
        fileName: file.name,
        contentType: file.type,
        byteSize: file.size
      }));
      await firstValueFrom(this.tenantSettingsService.uploadLogo(upload, file));
      this.form.logoUrl = this.tenantSettingsService.logoUrl(upload.documentId);
      this.message.set('Logo uploaded. Save settings to apply it to invoices and reports.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to upload logo.'));
    } finally {
      this.uploadingLogo.set(false);
    }
  }

  protected clearLogo(): void {
    this.form.logoUrl = '';
  }

  private populate(settings: TenantSettingsRecord): void {
    Object.assign(this.form, {
      organizationName: settings.organizationName || settings.tenantName,
      billingEmail: settings.billingEmail || '',
      supportEmail: settings.supportEmail || '',
      phone: settings.phone || '',
      websiteUrl: settings.websiteUrl || '',
      addressLine1: settings.addressLine1 || '',
      city: settings.city || '',
      provinceCode: settings.provinceCode || '',
      postalCode: settings.postalCode || '',
      countryCode: settings.countryCode || '',
      invoicePrefix: settings.invoicePrefix || 'INV',
      invoiceFooter: settings.invoiceFooter || '',
      paymentTerms: settings.paymentTerms || '',
      logoUrl: settings.logoUrl || '',
      themePrimaryColor: settings.themePrimaryColor || '#0f766e',
      themeAccentColor: settings.themeAccentColor || '#2563eb',
      emailProvider: settings.emailProvider || 'SYSTEM',
      emailSenderName: settings.emailSenderName || settings.organizationName || settings.tenantName,
      emailFromAddress: settings.emailFromAddress || '',
      emailReplyToAddress: settings.emailReplyToAddress || '',
      smtpHost: settings.smtpHost || '',
      smtpPort: settings.smtpPort || 587,
      smtpUsername: settings.smtpUsername || '',
      smtpPassword: '',
      clearSmtpPassword: false,
      smtpUseTls: settings.smtpUseTls
    });
  }
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
