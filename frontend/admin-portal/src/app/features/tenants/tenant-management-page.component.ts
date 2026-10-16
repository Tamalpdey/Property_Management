import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import type {
  SuperAdminTenantDetail,
  SuperAdminTenantSummary,
  TenantAdministrationEvent,
  UpdateTenantRequest,
} from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { SuperAdminTenantService } from './services/super-admin-tenant.service';
import { tenantCsv } from './tenant-export';
import { TenantAccessButtonComponent } from './tenant-access-button.component';
import { ActivatedRoute } from '@angular/router';

@Component({
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TenantAccessButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="directory">
      <header class="page-heading">
        <div>
          <p class="eyebrow">Platform administration</p>
          <h1>Tenants</h1>
        </div>
        <div class="actions">
          <button pButton severity="secondary" icon="pi pi-download" aria-label="Export filtered tenants" title="Export filtered tenants" [disabled]="loading() || !filtered().length" (click)="exportTenants()"></button>
          <button
            pButton
            severity="secondary"
            icon="pi pi-refresh"
            aria-label="Refresh tenants"
            title="Refresh tenants"
            [disabled]="loading()"
            (click)="load()"
          ></button>
          <a
            pButton
            routerLink="/tenants/new"
            icon="pi pi-plus"
            label="New tenant"
          ></a>
        </div>
      </header>
      <div class="metrics">
        <div>
          <span>Organizations</span><strong>{{ tenants().length }}</strong>
        </div>
        <div>
          <span>Active</span><strong>{{ count('ACTIVE') }}</strong>
        </div>
        <div>
          <span>Trial</span><strong>{{ count('TRIAL') }}</strong>
        </div>
        <div>
          <span>Quotes enabled</span><strong>{{ quotesCount() }}</strong>
        </div>
        <div>
          <span>Without active admin</span><strong>{{ adminRiskCount() }}</strong>
        </div>
      </div>
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      <div class="toolbar">
        <label class="search"
          ><i class="pi pi-search"></i
          ><input
            pInputText
            aria-label="Search tenants"
            placeholder="Name, subdomain, administrator"
            [ngModel]="search()"
            (ngModelChange)="search.set($event)"
        /></label>
        <select
          aria-label="Filter by status"
          [ngModel]="status()"
          (ngModelChange)="status.set($event)"
        >
          <option value="">All statuses</option>
          @for (item of statuses; track item) {
            <option [value]="item">{{ label(item) }}</option>
          }
        </select>
        <select
          aria-label="Filter by plan"
          [ngModel]="plan()"
          (ngModelChange)="plan.set($event)"
        >
          <option value="">All plans</option>
          @for (item of plans; track item) {
            <option [value]="item">{{ label(item) }}</option>
          }
        </select>
        <select
          aria-label="Filter by quote module"
          [ngModel]="module()"
          (ngModelChange)="module.set($event)"
        >
          <option value="">All modules</option>
          <option value="enabled">Quotes enabled</option>
          <option value="disabled">Quotes disabled</option>
        </select>
        <span class="muted">{{ filtered().length }} results</span>
        <select aria-label="Filter administrator access" [ngModel]="adminAccess()" (ngModelChange)="adminAccess.set($event)">
          <option value="">All admin access</option><option value="missing">No active admin</option><option value="single">Single admin</option>
        </select>
      </div>
      @if (loading()) {
        <p class="empty" role="status">Loading tenants...</p>
      } @else if (!filtered().length) {
        <div class="empty">
          <i class="pi pi-building"></i>
          <h2>No tenants found</h2>
          <button
            pButton
            severity="secondary"
            label="Clear filters"
            (click)="clearFilters()"
          ></button>
        </div>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Portal identity</th>
                <th>Administrator</th>
                <th>Usage</th>
                <th>Modules</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (tenant of filtered(); track tenant.id) {
                <tr>
                  <td>
                    <button class="tenant-link" (click)="open(tenant)">
                      {{ tenant.displayName }}</button
                    ><small>{{ tenant.legalName }}</small
                    ><small>{{ label(tenant.planCode) }}</small>
                  </td>
                  <td>
                    <strong>{{
                      tenant.portalSubdomain || 'Not assigned'
                    }}</strong
                    ><small>{{ tenant.timezone }}</small>
                  </td>
                  <td>{{ tenant.administratorEmail || 'Not assigned' }}
                    @if (tenant.activeAdministrators !== undefined) { <small [class.access-risk]="tenant.activeAdministrators === 0">{{ tenant.activeAdministrators }} active admin(s)</small> }
                  </td>
                  <td>
                    <strong>{{ tenant.activeUsers }} users</strong
                    ><small>{{ tenant.activeProperties }} properties</small>
                  </td>
                  <td>
                    <span
                      class="badge"
                      [class.enabled]="tenant.quoteManagementEnabled"
                      >Quotes
                      {{ tenant.quoteManagementEnabled ? 'on' : 'off' }}</span
                    >
                  </td>
                  <td>
                    <span
                      class="badge"
                      [class.enabled]="tenant.status === 'ACTIVE'"
                      [class.blocked]="
                        tenant.status === 'SUSPENDED' ||
                        tenant.status === 'CANCELLED'
                      "
                      >{{ label(tenant.status) }}</span
                    >
                  </td>
                  <td>
                    <div class="row-actions">
                    <lorne-tenant-access-button [tenant]="tenant" (changed)="accessChanged($event)" />
                    <a pButton severity="secondary" icon="pi pi-shield" [routerLink]="['/tenants', tenant.id, 'support']" [attr.aria-label]="'Support ' + tenant.displayName" title="Tenant support"></a>
                    <button
                      pButton
                      severity="secondary"
                      icon="pi pi-pencil"
                      [attr.aria-label]="'Edit ' + tenant.displayName"
                      title="Manage tenant"
                      (click)="open(tenant)"
                    ></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <p-dialog
      [visible]="editorVisible()"
      (visibleChange)="close()"
      [modal]="true"
      [header]="selected()?.tenant?.displayName || 'Manage tenant'"
      [style]="{ width: '860px', maxWidth: 'calc(100vw - 24px)' }"
      [draggable]="false"
      [closable]="!saving()"
      [closeOnEscape]="!saving()"
    >
      @if (detailLoading()) {
        <p class="empty">Loading tenant...</p>
      }
      @if (editError()) {
        <p class="error" role="alert">{{ editError() }}</p>
      }
      @if (selected(); as detail) {
        <div class="tabs" role="tablist" aria-label="Tenant settings">
          @for (item of tabs; track item.key) {
            <button
              type="button"
              role="tab"
              [id]="'tenant-tab-' + item.key"
              [attr.aria-controls]="'tenant-panel-' + tab()"
              [attr.tabindex]="tab() === item.key ? 0 : -1"
              [attr.aria-selected]="tab() === item.key"
              [class.active]="tab() === item.key"
              (keydown)="navigateTabs($event, item.key)"
              (click)="tab.set(item.key)"
            >
              <i [class]="item.icon" aria-hidden="true"></i>{{ item.label }}
            </button>
          }
        </div>
        <form
          (ngSubmit)="save()"
          #editForm="ngForm"
          role="tabpanel"
          [id]="'tenant-panel-' + tab()"
          [attr.aria-labelledby]="'tenant-tab-' + tab()"
        >
          <fieldset
            [disabled]="saving()"
            style="margin:0;padding:0;border:0;min-width:0"
          >
            @if (tab() === 'profile') {
              <div class="fields">
                <label
                  >Display name<input
                    pInputText
                    name="displayName"
                    [(ngModel)]="form.displayName"
                    required
                    maxlength="120"
                /></label>
                <label
                  >Legal name<input
                    pInputText
                    name="legalName"
                    [(ngModel)]="form.legalName"
                    required
                    maxlength="160"
                /></label>
                <label
                  >Portal subdomain<input
                    pInputText
                    name="subdomain"
                    [(ngModel)]="form.portalSubdomain"
                    required
                    maxlength="40"
                    pattern="[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?"
                /></label>
                <label
                  >Timezone<input
                    pInputText
                    name="timezone"
                    [(ngModel)]="form.timezone"
                    required
                    maxlength="80"
                /></label>
                <label
                  >Plan<select name="plan" [(ngModel)]="form.planCode">
                    @for (item of plans; track item) {
                      <option [value]="item">{{ label(item) }}</option>
                    }
                  </select></label
                >
                <label
                  >Status<select name="status" [(ngModel)]="form.status">
                    @for (item of statuses; track item) {
                      <option [value]="item">{{ label(item) }}</option>
                    }
                  </select></label
                >
              </div>
              @if (form.portalSubdomain !== detail.tenant.portalSubdomain) {
                <p class="warning">
                  Changing the subdomain changes both login URLs. Existing
                  bookmarks and shared links will need updating.
                </p>
              }
              @if (form.status === 'SUSPENDED' || form.status === 'CANCELLED') {
                <p class="warning">
                  Tenant and worker access will be blocked and refresh sessions
                  revoked. Records are retained.
                </p>
              }
            }
            @if (tab() === 'company') {
              <div class="fields">
                <label class="full"
                  >Company name<input
                    pInputText
                    name="organization"
                    [(ngModel)]="form.organizationName"
                    required
                    maxlength="160"
                /></label>
                <label
                  >Billing email<input
                    pInputText
                    type="email"
                    name="billingEmail"
                    [(ngModel)]="form.billingEmail"
                    email
                    maxlength="200"
                /></label>
                <label
                  >Support email<input
                    pInputText
                    type="email"
                    name="supportEmail"
                    [(ngModel)]="form.supportEmail"
                    email
                    maxlength="200"
                /></label>
                <label
                  >Telephone<input
                    pInputText
                    name="phone"
                    [(ngModel)]="form.companyPhone"
                    maxlength="40"
                /></label>
                <label
                  >Website<input
                    pInputText
                    name="website"
                    [(ngModel)]="form.websiteUrl"
                    maxlength="300"
                /></label>
                <label class="full"
                  >Address line 1<input
                    pInputText
                    name="address1"
                    [(ngModel)]="form.addressLine1"
                    maxlength="240"
                /></label>
                <label class="full"
                  >Address line 2<input
                    pInputText
                    name="address2"
                    [(ngModel)]="form.addressLine2"
                    maxlength="240"
                /></label>
                <label
                  >City<input
                    pInputText
                    name="city"
                    [(ngModel)]="form.city"
                    maxlength="120"
                /></label>
                <label
                  >Province / state<input
                    pInputText
                    name="province"
                    [(ngModel)]="form.provinceCode"
                    maxlength="40"
                /></label>
                <label
                  >Postal code<input
                    pInputText
                    name="postal"
                    [(ngModel)]="form.postalCode"
                    maxlength="24"
                /></label>
                <label
                  >Country code<input
                    pInputText
                    name="country"
                    [(ngModel)]="form.countryCode"
                    required
                    pattern="[A-Za-z]{2}"
                    maxlength="2"
                /></label>
              </div>
            }
            @if (tab() === 'modules') {
              <div class="module-row">
                <div>
                  <h3>Quote management</h3>
                  <p>
                    Quotes, protected client approval, PDFs, email and work
                    order conversion.
                  </p>
                </div>
                <label class="toggle"
                  ><input
                    type="checkbox"
                    aria-label="Enable quote management"
                    [checked]="detail.tenant.quoteManagementEnabled"
                    [disabled]="saving()"
                    (change)="toggleQuotes($event)"
                  />{{
                    detail.tenant.quoteManagementEnabled
                      ? 'Enabled'
                      : 'Disabled'
                  }}</label
                >
              </div>
              <h3 class="section-title">Core services</h3>
              <div class="core-services">
                @for (service of coreServices; track service.label) {
                  <div>
                    <i [class]="service.icon"></i
                    ><span>{{ service.label }}</span
                    ><span class="badge enabled">Included</span>
                  </div>
                }
              </div>
            }
            @if (tab() === 'portals') {
              @for (surface of surfaces; track surface.key) {
                <div class="portal-row">
                  <h3>{{ surface.label }}</h3>
                  <div class="portal-url">
                    <a
                      [href]="portalUrl(detail.tenant, surface.key)"
                      target="_blank"
                      rel="noopener"
                      >{{ portalUrl(detail.tenant, surface.key) }}</a
                    ><button
                      pButton
                      type="button"
                      severity="secondary"
                      icon="pi pi-copy"
                      [attr.aria-label]="'Copy ' + surface.label"
                      title="Copy URL"
                      (click)="copyUrl(detail.tenant, surface.key)"
                    ></button>
                  </div>
                </div>
              }
              <dl class="tenant-facts">
                <div>
                  <dt>Administrator</dt>
                  <dd>
                    {{ detail.tenant.administratorEmail || 'Not assigned' }}
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{{ date(detail.tenant.createdAt) }}</dd>
                </div>
                <div>
                  <dt>Tenant ID</dt>
                  <dd>{{ detail.tenant.id }}</dd>
                </div>
              </dl>
            }
            @if (tab() === 'history') {
              @if (historyLoading()) {
                <p class="empty">Loading history...</p>
              } @else {
                <ul class="history">
                  @for (event of history(); track event.id) {
                    <li>
                      <i class="pi pi-history"></i>
                      <div>
                        <strong
                          >{{ label(event.action)
                          }}{{
                            event.moduleCode
                              ? ' · ' + label(event.moduleCode)
                              : ''
                          }}</strong
                        ><small
                          >{{ event.actorName || 'System' }} ·
                          {{ date(event.createdAt) }}</small
                        >
                      </div>
                    </li>
                  } @empty {
                    <li>No administration events recorded.</li>
                  }
                </ul>
              }
            }
          </fieldset>
          <div class="editor-footer">
            <span role="status">{{ editNotice() }}</span
            ><button
              pButton
              type="button"
              severity="secondary"
              label="Close"
              [disabled]="saving()"
              (click)="close()"
            ></button>
            @if (tab() === 'profile' || tab() === 'company') {
              <button
                pButton
                type="submit"
                icon="pi pi-save"
                label="Save changes"
                [loading]="saving()"
                [disabled]="saving() || editForm.invalid === true"
              ></button>
            }
          </div>
        </form>
      }
    </p-dialog>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .directory {
      display: grid;
      gap: 20px;
    }
    h1,
    h2,
    h3,
    p {
      margin: 0;
    }
    h1 {
      font-size: 26px;
    }
    h3 {
      font-size: 15px;
    }
    .eyebrow {
      font-size: 12px;
      color: #64748b;
      margin-bottom: 5px;
    }
    .page-heading,
    .actions,
    .toolbar,
    .module-row,
    .portal-url,
    .editor-footer {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .page-heading {
      justify-content: space-between;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      background: white;
      border-block: 1px solid #e2e8f0;
    }
    .metrics > div {
      padding: 18px;
      border-right: 1px solid #e2e8f0;
    }
    .metrics span {
      display: block;
      color: #64748b;
      font-size: 12px;
    }
    .metrics strong {
      display: block;
      font-size: 24px;
      margin-top: 6px;
    }
    .toolbar {
      flex-wrap: wrap;
    }
    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 230px;
    }
    .search input {
      width: 100%;
      min-width: 0;
    }
    select {
      border: 1px solid #cbd5e1;
      background: white;
      border-radius: 6px;
      padding: 10px;
      font: inherit;
      color: #334155;
      font-size: 13px;
    }
    .muted,
    small {
      color: #64748b;
      font-size: 12px;
    }
    .table-scroll {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: white;
    }
    table {
      width: 100%;
      min-width: 1000px;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      font-size: 11px;
      text-transform: uppercase;
      color: #64748b;
      padding: 12px 16px;
    }
    td {
      padding: 16px;
      border-top: 1px solid #e2e8f0;
      max-width: 260px;
      overflow-wrap: anywhere;
    }
    tr:hover td {
      background: #fafbfc;
    }
    small {
      display: block;
      margin-top: 5px;
    }
    .tenant-link {
      border: 0;
      background: none;
      padding: 0;
      color: #1d4ed8;
      font: inherit;
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .row-actions { display: flex; gap: 6px; }
    .access-risk { color: #b91c1c; font-weight: 600; }
    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      color: #475569;
      background: #f1f5f9;
      border-radius: 4px;
      padding: 4px 7px;
      white-space: nowrap;
    }
    .badge.enabled {
      background: #ecfdf5;
      color: #047857;
    }
    .badge.blocked {
      background: #fef2f2;
      color: #b91c1c;
    }
    .empty {
      text-align: center;
      padding: 40px;
      color: #64748b;
      display: grid;
      justify-items: center;
      gap: 14px;
    }
    .notice,
    .error,
    .warning {
      padding: 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.5;
    }
    .notice {
      background: #ecfdf5;
      color: #047857;
    }
    .error {
      background: #fef2f2;
      color: #b91c1c;
    }
    .warning {
      background: #fffbeb;
      color: #92400e;
      margin-top: 16px;
    }
    .tabs {
      display: flex;
      overflow-x: auto;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 22px;
      gap: 4px;
    }
    .tabs button {
      background: none;
      border: 0;
      border-bottom: 2px solid transparent;
      padding: 14px 12px;
      font: inherit;
      font-size: 13px;
      color: #64748b;
      cursor: pointer;
      display: flex;
      gap: 8px;
      align-items: center;
      white-space: nowrap;
    }
    .tabs button.active {
      color: #1d4ed8;
      border-color: #1d4ed8;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }
    .fields label {
      display: grid;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      min-width: 0;
    }
    .fields input,
    .fields select {
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
      font-weight: 400;
    }
    .full {
      grid-column: 1/-1;
    }
    .module-row {
      justify-content: space-between;
      padding-block: 12px 22px;
      border-bottom: 1px solid #e2e8f0;
    }
    .module-row p {
      font-size: 13px;
      line-height: 1.5;
      color: #64748b;
      margin-top: 6px;
      max-width: 430px;
    }
    .toggle {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 13px;
    }
    .toggle input {
      width: 18px;
      height: 18px;
    }
    .section-title {
      margin: 24px 0 14px;
    }
    .core-services {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0 20px;
    }
    .core-services > div {
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #e2e8f0;
      padding: 14px 0;
      font-size: 13px;
    }
    .core-services .badge {
      margin-left: auto;
    }
    .core-services i {
      color: #1d4ed8;
    }
    .portal-row {
      padding-block: 16px;
      border-bottom: 1px solid #e2e8f0;
    }
    .portal-url {
      justify-content: space-between;
      margin-top: 10px;
    }
    .portal-url a {
      font-size: 13px;
      overflow-wrap: anywhere;
      color: #1d4ed8;
    }
    .tenant-facts {
      display: grid;
      gap: 18px;
      font-size: 13px;
      margin-top: 24px;
    }
    .tenant-facts dt {
      font-size: 11px;
      color: #64748b;
    }
    .tenant-facts dd {
      margin: 6px 0 0;
      overflow-wrap: anywhere;
    }
    .editor-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 18px;
      margin-top: 24px;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .editor-footer > span {
      margin-right: auto;
      font-size: 12px;
      color: #047857;
    }
    .history {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .history li {
      display: flex;
      gap: 14px;
      padding: 16px 0;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    .history i {
      color: #64748b;
    }
    @media (max-width: 600px) {
      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .fields,
      .core-services {
        grid-template-columns: 1fr;
      }
      .page-heading {
        align-items: flex-start;
      }
      .module-row {
        align-items: flex-start;
        flex-direction: column;
      }
      .toolbar select {
        flex: 1;
        min-width: 135px;
      }
      .actions {
        gap: 6px;
      }
    }
  `,
})
export class TenantManagementPageComponent {
  private readonly service = inject(SuperAdminTenantService);
  private readonly route = inject(ActivatedRoute);
  protected readonly tenants = signal<SuperAdminTenantSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly search = signal('');
  protected readonly status = signal('');
  protected readonly plan = signal('');
  protected readonly module = signal('');
  protected readonly adminAccess = signal('');
  protected readonly adminRiskCount = computed(() => this.tenants().filter(tenant => tenant.activeAdministrators === 0).length);
  protected readonly quotesCount = computed(
    () => this.tenants().filter((t) => t.quoteManagementEnabled).length,
  );
  protected readonly filtered = computed(() =>
    this.tenants().filter(
      (t) =>
        (!this.status() || t.status === this.status()) &&
        (!this.plan() || t.planCode === this.plan()) &&
        (!this.adminAccess() || t.activeAdministrators === (this.adminAccess() === 'missing' ? 0 : 1)) &&
        (!this.module() ||
          t.quoteManagementEnabled === (this.module() === 'enabled')) &&
        [
          t.displayName,
          t.legalName,
          t.portalSubdomain,
          t.administratorEmail,
        ].some((v) =>
          v?.toLowerCase().includes(this.search().trim().toLowerCase()),
        ),
    ),
  );
  protected readonly selected = signal<SuperAdminTenantDetail | null>(null);
  protected readonly editorVisible = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly editError = signal('');
  protected readonly editNotice = signal('');
  protected readonly history = signal<TenantAdministrationEvent[]>([]);
  protected readonly historyLoading = signal(false);
  protected readonly tab = signal('profile');
  protected readonly statuses = [
    'TRIAL',
    'ACTIVE',
    'PAST_DUE',
    'SUSPENDED',
    'CANCELLED',
  ];
  protected readonly plans = ['starter', 'professional', 'enterprise'];
  protected readonly tabs = [
    { key: 'profile', label: 'Identity', icon: 'pi pi-building' },
    { key: 'company', label: 'Company', icon: 'pi pi-id-card' },
    { key: 'modules', label: 'Modules', icon: 'pi pi-th-large' },
    { key: 'portals', label: 'Access', icon: 'pi pi-link' },
    { key: 'history', label: 'History', icon: 'pi pi-history' },
  ];
  protected readonly coreServices = [
    { label: 'Work orders & scheduling', icon: 'pi pi-calendar' },
    { label: 'Worker app', icon: 'pi pi-mobile' },
    { label: 'Invoices & payments', icon: 'pi pi-wallet' },
    { label: 'Inventory', icon: 'pi pi-box' },
    { label: 'Reports & day tickets', icon: 'pi pi-chart-bar' },
    { label: 'Communications', icon: 'pi pi-envelope' },
  ];
  protected readonly surfaces = [
    { key: 'app' as const, label: 'Tenant portal' },
    { key: 'worker' as const, label: 'Worker portal' },
  ];
  protected form = {} as UpdateTenantRequest;
  private selectionRequest = 0;

  constructor() {
    this.adminAccess.set(this.route.snapshot.queryParamMap.get('adminAccess') || '');
    this.status.set(this.route.snapshot.queryParamMap.get('status') || '');
    void this.load();
  }
  protected accessChanged(tenant: SuperAdminTenantSummary): void { this.replace(tenant); this.notice.set('Tenant access updated.'); }
  protected count(status: string): number {
    return this.tenants().filter((t) => t.status === status).length;
  }
  protected exportTenants(): void {
    const url = URL.createObjectURL(new Blob(['\uFEFF', tenantCsv(this.filtered())], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'tenants-' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  protected navigateTabs(event: KeyboardEvent, key: string): void {
    const index = this.tabs.findIndex((tab) => tab.key === key);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % this.tabs.length;
    else if (event.key === 'ArrowLeft')
      next = (index + this.tabs.length - 1) % this.tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = this.tabs.length - 1;
    else return;
    event.preventDefault();
    this.tab.set(this.tabs[next].key);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelector<HTMLElement>('#tenant-tab-' + this.tabs[next].key)
      ?.focus();
  }
  protected label(value: string): string {
    if (value === 'SUSPENDED') return 'Inactive';
    return value
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  protected date(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  }
  protected clearFilters(): void {
    this.search.set('');
    this.status.set('');
    this.plan.set('');
    this.module.set('');
    this.adminAccess.set('');
  }
  protected async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      this.tenants.set(await firstValueFrom(this.service.list()));
    } catch (e) {
      this.error.set(this.message(e));
    } finally {
      this.loading.set(false);
    }
  }
  protected async open(tenant: SuperAdminTenantSummary): Promise<void> {
    const request = ++this.selectionRequest;
    this.editorVisible.set(true);
    this.selected.set(null);
    this.detailLoading.set(true);
    this.editError.set('');
    this.editNotice.set('');
    this.tab.set('profile');
    this.history.set([]);
    try {
      const detail = await firstValueFrom(this.service.detail(tenant.id));
      if (request !== this.selectionRequest) return;
      this.form = { ...detail.profile };
      this.selected.set(detail);
      void this.loadHistory(tenant.id, request);
    } catch (e) {
      if (request === this.selectionRequest)
        this.editError.set(this.message(e));
    } finally {
      if (request === this.selectionRequest) this.detailLoading.set(false);
    }
  }
  protected close(): void {
    if (!this.saving()) {
      ++this.selectionRequest;
      this.editorVisible.set(false);
    }
  }
  protected async save(): Promise<void> {
    const detail = this.selected();
    if (!detail || this.saving()) return;
    if (
      !this.form.displayName?.trim() ||
      !this.form.legalName?.trim() ||
      !this.form.organizationName?.trim() ||
      !this.form.timezone?.trim() ||
      !/^[A-Za-z]{2}$/.test(this.form.countryCode || '') ||
      !/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(
        this.form.portalSubdomain || '',
      )
    ) {
      this.editError.set(
        'Enter company names, a valid subdomain, timezone and two-letter country code.',
      );
      return;
    }
    if (
      (this.form.status !== detail.tenant.status ||
        this.form.portalSubdomain !== detail.tenant.portalSubdomain) &&
      !confirm(
        'Apply the status or portal identity change? This may affect tenant access.',
      )
    )
      return;
    this.saving.set(true);
    this.editError.set('');
    this.editNotice.set('');
    try {
      const updated = await firstValueFrom(
        this.service.update(detail.tenant.id, { ...this.form }),
      );
      this.selected.set(updated);
      this.form = { ...updated.profile };
      this.replace(updated.tenant);
      this.editNotice.set('Changes saved.');
      await this.loadHistory(detail.tenant.id, this.selectionRequest);
    } catch (e) {
      this.editError.set(this.message(e));
    } finally {
      this.saving.set(false);
    }
  }
  protected async toggleQuotes(event: Event): Promise<void> {
    const detail = this.selected();
    if (!detail || this.saving()) return;
    const checkbox = event.target as HTMLInputElement;
    const enabled = checkbox.checked;
    checkbox.checked = detail.tenant.quoteManagementEnabled;
    if (
      !enabled &&
      !confirm(
        'Disable Quotes? Shared quote links and quote actions will become unavailable. Existing records will be retained.',
      )
    ) {
      this.selected.set({ ...detail });
      return;
    }
    this.saving.set(true);
    this.editError.set('');
    this.editNotice.set('');
    try {
      const tenant = await firstValueFrom(
        this.service.updateModule(detail.tenant.id, 'QUOTES', enabled),
      );
      this.selected.set({ ...detail, tenant });
      this.replace(tenant);
      this.editNotice.set('Module updated.');
      await this.loadHistory(tenant.id, this.selectionRequest);
    } catch (e) {
      this.selected.set({ ...detail });
      this.editError.set(this.message(e));
    } finally {
      this.saving.set(false);
    }
  }
  protected portalUrl(
    tenant: SuperAdminTenantSummary,
    surface: 'app' | 'worker',
  ): string {
    const hostname = window.location.hostname;
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1'
    )
      return `http://${tenant.portalSubdomain}.${surface}.localhost:${surface === 'app' ? 4500 : 4502}/login`;
    const root = hostname.startsWith('admin.') ? hostname.slice(6) : hostname;
    return `https://${tenant.portalSubdomain}.${surface}.${root}/login`;
  }
  protected async copyUrl(
    tenant: SuperAdminTenantSummary,
    surface: 'app' | 'worker',
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.portalUrl(tenant, surface));
      this.editNotice.set('URL copied.');
    } catch {
      this.editError.set(
        'Could not access the clipboard. Select the URL to copy it.',
      );
    }
  }
  private replace(tenant: SuperAdminTenantSummary): void {
    this.tenants.update((items) =>
      items.map((item) => (item.id === tenant.id ? tenant : item)),
    );
  }
  private async loadHistory(tenantId: string, request: number): Promise<void> {
    this.historyLoading.set(true);
    try {
      const history = await firstValueFrom(this.service.history(tenantId));
      if (request === this.selectionRequest) this.history.set(history);
    } catch (e) {
      if (request === this.selectionRequest)
        this.editError.set(this.message(e));
    } finally {
      if (request === this.selectionRequest) this.historyLoading.set(false);
    }
  }
  private message(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? error.error?.error?.message ||
          error.error?.message ||
          'Tenant operation failed. Please try again.'
      : 'Tenant operation failed. Please try again.';
  }
}
