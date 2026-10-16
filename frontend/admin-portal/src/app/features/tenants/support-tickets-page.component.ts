import { DatePipe } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpParams
} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type ApiResponse,
  type SupportAgent,
  type SupportTicketDetail,
  type SupportTicketPage,
  type SuperAdminTenantSummary
} from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-tickets-page.component.html',
  styleUrls: ['./support-tickets.scss']
})
export class SupportTicketsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly base =
    environment.apiBaseUrl + '/superadmin/support-tickets';
  protected readonly priorities = SUPPORT_PRIORITIES;
  protected readonly statuses = SUPPORT_STATUSES;
  protected readonly tenants = signal<SuperAdminTenantSummary[]>([]);
  protected readonly agents = signal<SupportAgent[]>([]);
  protected readonly page = signal<SupportTicketPage>({
    items: [],
    total: 0,
    page: 0,
    size: 25
  });
  protected readonly detail = signal<SupportTicketDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly detailLoading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly detailError = signal('');
  protected query = '';
  protected tenantId = '';
  protected status = 'UNRESOLVED';
  protected priority = '';
  protected reply = '';
  protected internal = false;
  protected edit = { status: 'OPEN', priority: 'NORMAL', assignedTo: '' };
  private listRequest = 0;
  private detailRequest = 0;

  constructor() {
    void this.loadChoices();
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.tenantId = params.get('tenantId') || '';
      this.status = params.get('status') || 'UNRESOLVED';
      this.priority = params.get('priority') || '';
      void this.load(0);
    });
  }
  protected label(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }
  protected async load(page = 0): Promise<void> {
    const request = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    const params = new HttpParams({
      fromObject: {
        tenantId: this.tenantId,
        status: this.status,
        priority: this.priority,
        query: this.query,
        page,
        size: 25
      }
    });
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<SupportTicketPage>>(this.base, { params })
      );
      if (request === this.listRequest) this.page.set(response.data);
    } catch (error) {
      if (request === this.listRequest) this.error.set(this.message(error));
    } finally {
      if (request === this.listRequest) this.loading.set(false);
    }
  }
  protected async open(id: string, refresh = false): Promise<void> {
    if (this.saving()) return;
    if (
      !refresh &&
      this.detail()?.ticket.id !== id &&
      this.reply.trim() &&
      !confirm('Discard the unsent reply?')
    )
      return;
    const request = ++this.detailRequest;
    if (this.detail()?.ticket.id !== id) {
      this.detail.set(null);
      this.reply = '';
    }
    this.detailLoading.set(true);
    this.detailError.set('');
    try {
      const response = await firstValueFrom(
        this.http.get<ApiResponse<SupportTicketDetail>>(`${this.base}/${id}`)
      );
      if (request === this.detailRequest) this.setDetail(response.data);
    } catch (error) {
      if (request === this.detailRequest)
        this.detailError.set(this.message(error));
    } finally {
      if (request === this.detailRequest) this.detailLoading.set(false);
    }
  }
  protected async save(): Promise<void> {
    const selected = this.detail();
    if (!selected || this.saving()) return;
    this.saving.set(true);
    this.detailError.set('');
    try {
      const response = await firstValueFrom(
        this.http.patch<ApiResponse<SupportTicketDetail>>(
          `${this.base}/${selected.ticket.id}`,
          {
            ...this.edit,
            assignedTo: this.edit.assignedTo || null,
            version: selected.ticket.version
          }
        )
      );
      this.setDetail(response.data);
      await this.load(this.page().page);
    } catch (error) {
      this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  protected async send(): Promise<void> {
    const selected = this.detail();
    if (!selected || !this.reply.trim() || this.saving()) return;
    this.saving.set(true);
    this.detailError.set('');
    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<SupportTicketDetail>>(
          `${this.base}/${selected.ticket.id}/messages`,
          { body: this.reply.trim(), internal: this.internal }
        )
      );
      this.reply = '';
      this.setDetail(response.data);
      await this.load(this.page().page);
    } catch (error) {
      this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  private setDetail(detail: SupportTicketDetail): void {
    this.detail.set(detail);
    this.edit = {
      status: detail.ticket.status,
      priority: detail.ticket.priority,
      assignedTo: detail.ticket.assignedTo || ''
    };
  }
  private async loadChoices(): Promise<void> {
    try {
      const [tenants, agents] = await Promise.all([
        firstValueFrom(
          this.http.get<ApiResponse<SuperAdminTenantSummary[]>>(
            environment.apiBaseUrl + '/superadmin/tenants'
          )
        ),
        firstValueFrom(
          this.http.get<ApiResponse<SupportAgent[]>>(this.base + '/agents')
        )
      ]);
      this.tenants.set(tenants.data);
      this.agents.set(agents.data);
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  private message(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? error.error?.error?.message ||
          'Unable to complete the ticket operation.'
      : 'Unable to complete the ticket operation.';
  }
}
