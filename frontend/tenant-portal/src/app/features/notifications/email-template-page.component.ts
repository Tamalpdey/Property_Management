import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import type { EmailTemplateRecord } from '@lorne/contracts';
import { EmailTemplateService } from './services/email-template.service';

type TemplateSlug = 'invoice-owner' | 'work-order-completed-owner';

interface TemplateOption {
  slug: TemplateSlug;
  label: string;
  description: string;
  eyebrow: string;
  variableGroups: VariableGroup[];
}

interface VariableGroup {
  label: string;
  variables: string[];
}

@Component({
  selector: 'lorne-email-template-page',
  standalone: true,
  imports: [ButtonModule, FormsModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="space-y-3">
      <div class="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-wrap items-center gap-2">
            <p-tag value="Administration" severity="info" />
            <h1 class="text-xl font-bold text-slate-950 md:text-2xl">Email templates</h1>
          </div>
          <button pButton type="button" severity="secondary" icon="pi pi-refresh" label="Refresh" [loading]="loading()" (click)="loadSelected(true)"></button>
        </div>
      </div>

      @if (message()) {
        <p class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{{ message() }}</p>
      }
      @if (error()) {
        <p class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{{ error() }}</p>
      }

      <section class="grid gap-3 lg:grid-cols-[20rem_1fr]">
        <aside class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div class="grid gap-2">
            @for (option of templateOptions; track option.slug) {
              <button
                type="button"
                class="w-full rounded-lg border px-3 py-3 text-left transition"
                [class.border-teal-300]="activeTemplate() === option.slug"
                [class.bg-teal-50]="activeTemplate() === option.slug"
                [class.border-slate-200]="activeTemplate() !== option.slug"
                [class.bg-white]="activeTemplate() !== option.slug"
                (click)="selectTemplate(option.slug)"
              >
                <span class="block text-xs font-black uppercase tracking-wide text-teal-700">{{ option.eyebrow }}</span>
                <span class="mt-1 block text-sm font-black text-slate-950">{{ option.label }}</span>
                <span class="mt-1 block text-xs font-semibold leading-5 text-slate-500">{{ option.description }}</span>
              </button>
            }
          </div>
        </aside>

        <form class="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" (ngSubmit)="save()">
          <div class="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wide text-teal-700">{{ selectedOption().eyebrow }}</p>
              <h2 class="mt-1 text-xl font-black text-slate-950">{{ selectedOption().label }}</h2>
              <p class="mt-1 text-sm font-semibold text-slate-500">{{ selectedOption().description }}</p>
            </div>
            @if (template(); as current) {
              <p class="text-xs font-bold text-slate-500">Updated {{ current.updatedAt }}</p>
            }
          </div>

          <label class="mt-3 block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Subject</span>
            <input class="w-full border border-slate-300 px-3 py-2 text-sm" name="subject" [(ngModel)]="form.subject" />
          </label>

          <label class="mt-3 block">
            <span class="mb-1 block text-sm font-bold text-slate-700">Body</span>
            <textarea class="min-h-96 w-full border border-slate-300 px-3 py-2 text-sm" name="body" [(ngModel)]="form.body"></textarea>
          </label>

          <div class="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-xs font-black uppercase tracking-wide text-teal-700">Available variables</p>
                <p class="text-xs font-semibold text-slate-500">Use these exactly in the subject or body. HTML blocks render with tenant colors and logo.</p>
              </div>
              <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">{{ variableCount() }} variables</span>
            </div>
            <div class="mt-3 grid gap-3 lg:grid-cols-2">
              @for (group of selectedOption().variableGroups; track group.label) {
                <div class="rounded-lg border border-slate-200 bg-white p-3">
                  <p class="text-xs font-black uppercase tracking-wide text-slate-500">{{ group.label }}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    @for (variable of group.variables; track variable) {
                      <button
                        type="button"
                        class="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-bold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100"
                        (click)="insertVariable(variable)"
                      >
                        {{ '{{' + variable + '}}' }}
                      </button>
                    }
                  </div>
                </div>
              }
          </div>
          </div>

          <div class="mt-3 flex justify-end gap-2">
            <button pButton type="button" severity="secondary" label="Reset to latest default" [loading]="resetting()" (click)="reset()"></button>
            <button pButton type="submit" icon="pi pi-save" label="Save template" [loading]="saving()"></button>
          </div>
        </form>
      </section>
    </section>
  `
})
export class EmailTemplatePageComponent {
  private readonly emailTemplateService = inject(EmailTemplateService);
  protected readonly templateOptions: TemplateOption[] = [
    {
      slug: 'invoice-owner',
      label: 'Owner invoice email',
      description: 'Sent with the generated invoice PDF from the finance screen.',
      eyebrow: 'Invoice',
      variableGroups: [
        {
          label: 'Tenant branding',
          variables: ['tenantName', 'tenantLogoBlock', 'tenantLogoUrl', 'tenantPrimaryColor', 'tenantAccentColor']
        },
        {
          label: 'Owner and property',
          variables: ['ownerName', 'ownerCode', 'propertyName', 'propertyCode', 'propertyAddress']
        },
        {
          label: 'Invoice',
          variables: ['invoiceNumber', 'invoiceSubtotal', 'invoiceTax', 'invoiceTotal', 'issuedOn', 'dueOn']
        },
        {
          label: 'Work order',
          variables: ['workOrderNumber', 'workOrderTitle', 'serviceName']
        }
      ]
    },
    {
      slug: 'work-order-completed-owner',
      label: 'Owner work completed email',
      description: 'Sent after operations approves field work completion.',
      eyebrow: 'Completion',
      variableGroups: [
        {
          label: 'Tenant branding',
          variables: ['tenantName', 'tenantLogoBlock', 'tenantLogoUrl', 'tenantPrimaryColor', 'tenantAccentColor']
        },
        {
          label: 'Owner and property',
          variables: ['ownerName', 'ownerCode', 'propertyName', 'propertyCode', 'propertyAddress']
        },
        {
          label: 'Work order',
          variables: ['workOrderNumber', 'workOrderTitle', 'serviceName', 'completedAt', 'reviewNote']
        },
        {
          label: 'Field completion',
          variables: ['onSiteWorkers', 'arrivedOnSiteAt', 'workCompletedAt', 'fieldCompletionBlock']
        },
        {
          label: 'Maintenance record',
          variables: ['maintenanceRecordBlock', 'maintenanceRecordSummary', 'maintenanceClientNote', 'serviceDetails', 'deliveriesSummary']
        }
      ]
    }
  ];
  protected readonly activeTemplate = signal<TemplateSlug>('invoice-owner');
  protected readonly templates = signal<Record<TemplateSlug, EmailTemplateRecord | null>>({
    'invoice-owner': null,
    'work-order-completed-owner': null
  });
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly resetting = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly form = { subject: '', body: '' };

  constructor() {
    void this.loadSelected();
  }

  protected template(): EmailTemplateRecord | null {
    return this.templates()[this.activeTemplate()];
  }

  protected selectedOption(): TemplateOption {
    return this.templateOptions.find((option) => option.slug === this.activeTemplate()) ?? this.templateOptions[0];
  }

  protected async selectTemplate(slug: TemplateSlug): Promise<void> {
    this.activeTemplate.set(slug);
    this.message.set('');
    const cached = this.template();
    if (cached) {
      this.populate(cached);
      return;
    }
    await this.loadSelected();
  }

  protected async loadSelected(force = false): Promise<void> {
    if (!force && this.template()) {
      this.populate(this.template() as EmailTemplateRecord);
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const template = await firstValueFrom(
        this.activeTemplate() === 'invoice-owner'
          ? this.emailTemplateService.invoiceOwner()
          : this.emailTemplateService.workOrderCompletedOwner()
      );
      this.templates.update((templates) => ({ ...templates, [this.activeTemplate()]: template }));
      this.populate(template);
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to load email template.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected variableCount(): number {
    return this.selectedOption().variableGroups.reduce((total, group) => total + group.variables.length, 0);
  }

  protected insertVariable(variable: string): void {
    this.form.body = `${this.form.body}${this.form.body.endsWith('\n') || this.form.body.length === 0 ? '' : '\n'}{{${variable}}}`;
  }

  protected async reset(): Promise<void> {
    if (this.resetting()) {
      return;
    }
    if (!window.confirm('Reset this template to the latest default copy? This will replace the current subject and body.')) {
      return;
    }
    this.resetting.set(true);
    this.error.set('');
    this.message.set('');
    try {
      const template = await firstValueFrom(
        this.activeTemplate() === 'invoice-owner'
          ? this.emailTemplateService.resetInvoiceOwner()
          : this.emailTemplateService.resetWorkOrderCompletedOwner()
      );
      this.templates.update((templates) => ({ ...templates, [this.activeTemplate()]: template }));
      this.populate(template);
      this.message.set('Email template reset to the latest default.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to reset email template.'));
    } finally {
      this.resetting.set(false);
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
      const template = await firstValueFrom(
        this.activeTemplate() === 'invoice-owner'
          ? this.emailTemplateService.updateInvoiceOwner(this.form)
          : this.emailTemplateService.updateWorkOrderCompletedOwner(this.form)
      );
      this.templates.update((templates) => ({ ...templates, [this.activeTemplate()]: template }));
      this.populate(template);
      this.message.set('Email template saved.');
    } catch (exception) {
      this.error.set(apiErrorMessage(exception, 'Unable to save email template.'));
    } finally {
      this.saving.set(false);
    }
  }

  private populate(template: EmailTemplateRecord): void {
    this.form.subject = template.subject;
    this.form.body = template.body;
  }
}

function apiErrorMessage(exception: unknown, fallback: string): string {
  if (exception instanceof HttpErrorResponse) {
    const body = exception.error;
    return typeof body?.error?.message === 'string' ? body.error.message : fallback;
  }
  return fallback;
}
