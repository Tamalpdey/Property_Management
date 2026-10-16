import { HttpErrorResponse } from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import type { QuoteTemplate, SuperAdminTenantSummary } from "@lorne/contracts";
import { ButtonModule } from "primeng/button";
import { firstValueFrom } from "rxjs";
import { SuperAdminTenantService } from "../tenants/services/super-admin-tenant.service";
import { QuoteTemplateService } from "./quote-template.service";
import { TenantQuoteTemplatesComponent } from "./tenant-quote-templates.component";

@Component({
  standalone: true,
  imports: [FormsModule, ButtonModule, TenantQuoteTemplatesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./quote-templates-page.component.html",
  styleUrls: ["./quote-templates.scss"],
})
export class QuoteTemplatesPageComponent {
  private readonly service = inject(QuoteTemplateService);
  private readonly tenantService = inject(SuperAdminTenantService);
  private readonly route = inject(ActivatedRoute);
  protected readonly templates = signal<QuoteTemplate[]>([]);
  protected readonly tenants = signal<SuperAdminTenantSummary[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal("");
  protected readonly notice = signal("");
  protected readonly tab = signal("templates");
  protected form: QuoteTemplate | null = null;
  protected tenantId = "";
  constructor() {
    this.tenantId = this.route.snapshot.queryParamMap.get("tenantId") || "";
    if (this.tenantId) this.tab.set("assignments");
    void this.load();
  }
  protected async load(): Promise<void> {
    if (this.loading() || this.saving()) return;
    this.loading.set(true);
    this.error.set("");
    try {
      const [templates, tenants] = await Promise.all([
        firstValueFrom(this.service.catalog()),
        firstValueFrom(this.tenantService.list()),
      ]);
      this.templates.set(templates);
      this.tenants.set(tenants);
      const selected =
        templates.find((item) => item.code === this.form?.code) || templates[0];
      this.form = selected ? { ...selected } : null;
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.loading.set(false);
    }
  }
  protected select(template: QuoteTemplate): void {
    if (this.saving()) return;
    const original = this.templates().find(
      (item) => item.code === this.form?.code,
    );
    if (
      this.form &&
      original &&
      JSON.stringify(this.form) !== JSON.stringify(original) &&
      !confirm("Discard unsaved template changes?")
    )
      return;
    this.form = { ...template };
    this.notice.set("");
    this.error.set("");
  }
  protected enabled(): boolean {
    return (
      this.tenants().find((tenant) => tenant.id === this.tenantId)
        ?.quoteManagementEnabled || false
    );
  }
  protected async save(): Promise<void> {
    if (!this.form?.name.trim() || this.saving()) return;
    this.saving.set(true);
    this.error.set("");
    this.notice.set("");
    try {
      const saved = await firstValueFrom(this.service.configure(this.form));
      this.templates.update((items) =>
        items.map((item) => (item.code === saved.code ? saved : item)),
      );
      this.form = { ...saved };
      this.notice.set(
        "Template defaults saved. Existing quotes are unchanged.",
      );
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  private message(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? error.error?.error?.message || "Unable to load quote templates."
      : "Unable to load quote templates.";
  }
}
