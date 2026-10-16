import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { FormsModule } from "@angular/forms";
import type { QuoteTemplate, QuoteTemplateAssignment } from "@lorne/contracts";
import { ButtonModule } from "primeng/button";
import { firstValueFrom } from "rxjs";
import { QuoteTemplateService } from "./quote-template.service";

@Component({
  selector: "lorne-tenant-quote-templates",
  standalone: true,
  imports: [FormsModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="assignment">
      <div class="heading">
        <div>
          <h2>Assigned quote templates</h2>
          <span class="muted">{{
            enabled() ? "Quotes enabled" : "Quote module disabled"
          }}</span>
        </div>
        <button
          pButton
          icon="pi pi-refresh"
          severity="secondary"
          aria-label="Refresh template assignments"
          title="Refresh template assignments"
          [disabled]="saving() || loading()"
          (click)="load()"
        ></button>
      </div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (notice()) {
        <p class="notice" role="status">{{ notice() }}</p>
      }
      @if (loading()) {
        <p class="muted" role="status">Loading assignments...</p>
      }
      @for (template of templates(); track template.code) {
        <div class="template-row">
          <label class="check"
            ><input
              type="checkbox"
              [checked]="assigned.templateCodes.includes(template.code)"
              [disabled]="saving() || loading()"
              (change)="toggle(template.code, $event)"
            /><span
              ><strong>{{ template.name }}</strong
              ><small>{{
                template.pricingMode === "ITEMIZED"
                  ? "Quantity and rate for each item"
                  : "Description lines and one total price"
              }}</small></span
            ></label
          >
          <label class="default"
            ><input
              type="radio"
              name="defaultQuoteTemplate"
              [value]="template.code"
              [(ngModel)]="assigned.defaultCode"
              [disabled]="
                saving() ||
                loading() ||
                !assigned.templateCodes.includes(template.code)
              "
            />Default</label
          >
        </div>
      }
      <div class="footer">
        <span class="muted">{{ assigned.templateCodes.length }} assigned</span
        ><button
          pButton
          icon="pi pi-save"
          label="Save assignments"
          [loading]="saving()"
          [disabled]="
            saving() ||
            loading() ||
            !assigned.templateCodes.length ||
            !assigned.templateCodes.includes(assigned.defaultCode)
          "
          (click)="save()"
        ></button>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .assignment {
      display: grid;
      gap: 16px;
    }
    h2 {
      margin: 0 0 5px;
      font-size: 17px;
      font-weight: 650;
    }
    .heading,
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .muted,
    small {
      color: #64748b;
      font-size: 12px;
    }
    .template-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 0;
      border-bottom: 1px solid #e2e8f0;
      flex-wrap: wrap;
    }
    .check,
    .default {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .check strong {
      display: block;
      font-weight: 600;
    }
    .check small {
      display: block;
      margin-top: 5px;
    }
    .check input,
    .default input {
      accent-color: #1d4ed8;
      width: 17px;
      height: 17px;
      flex: none;
    }
    .error,
    .notice {
      font-size: 13px;
      padding: 12px;
      margin: 0;
      line-height: 1.5;
    }
    .error {
      color: #b91c1c;
      background: #fef2f2;
    }
    .notice {
      color: #047857;
      background: #ecfdf5;
    }
    .footer {
      padding-top: 8px;
    }
  `,
})
export class TenantQuoteTemplatesComponent {
  readonly tenantId = input.required<string>();
  readonly enabled = input(false);
  private readonly service = inject(QuoteTemplateService);
  protected readonly templates = signal<QuoteTemplate[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal("");
  protected readonly notice = signal("");
  protected assigned: QuoteTemplateAssignment = {
    templateCodes: [],
    defaultCode: "",
  };
  private request = 0;
  constructor() {
    effect(() => {
      if (this.tenantId()) void this.load();
    });
  }
  protected async load(): Promise<void> {
    const request = ++this.request,
      id = this.tenantId();
    this.loading.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      const [templates, assigned] = await Promise.all([
        firstValueFrom(this.service.catalog()),
        firstValueFrom(this.service.assignment(id)),
      ]);
      if (request === this.request && id === this.tenantId()) {
        this.templates.set(templates);
        this.assigned = assigned;
      }
    } catch (error) {
      if (request === this.request) this.error.set(message(error));
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }
  protected toggle(code: string, event: Event): void {
    if ((event.target as HTMLInputElement).checked)
      this.assigned.templateCodes = [...this.assigned.templateCodes, code];
    else
      this.assigned.templateCodes = this.assigned.templateCodes.filter(
        (item) => item !== code,
      );
    if (!this.assigned.templateCodes.includes(this.assigned.defaultCode))
      this.assigned.defaultCode = this.assigned.templateCodes[0] || "";
  }
  protected async save(): Promise<void> {
    if (this.saving() || this.loading() || !this.assigned.templateCodes.length)
      return;
    const id = this.tenantId();
    this.saving.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      const saved = await firstValueFrom(
        this.service.assign(id, this.assigned),
      );
      if (id === this.tenantId()) {
        this.assigned = saved;
        this.notice.set("Quote template assignments saved.");
      }
    } catch (error) {
      if (id === this.tenantId()) this.error.set(message(error));
    } finally {
      this.saving.set(false);
    }
  }
}
function message(error: unknown): string {
  return error instanceof HttpErrorResponse
    ? error.error?.error?.message || "Unable to update quote templates."
    : "Unable to update quote templates.";
}
