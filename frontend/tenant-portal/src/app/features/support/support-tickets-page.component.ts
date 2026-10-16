import { TenantDatePipe as DatePipe } from '../../shared/tenant-date.pipe';
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
import { FormsModule } from '@angular/forms';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  type ApiResponse,
  type SupportTicketDetail,
  type SupportTicketPage
} from '@lorne/contracts';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Component({
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support-tickets-page.component.html',
  styleUrls: ['./support-tickets-page.component.scss']
})
export class TenantSupportTicketsPageComponent {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl + '/tenant/support-tickets';
  protected readonly categories = SUPPORT_CATEGORIES;
  protected readonly priorities = SUPPORT_PRIORITIES;
  protected readonly statuses = SUPPORT_STATUSES;
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
  protected readonly createError = signal('');
  protected readonly creating = signal(false);
  protected query = '';
  protected status = 'UNRESOLVED';
  protected reply = '';
  protected form = {
    subject: '',
    description: '',
    category: 'OTHER',
    priority: 'NORMAL'
  };
  private listRequest = 0;
  private detailRequest = 0;
  constructor() {
    void this.load(0);
  }
  protected label(value: string): string {
    return value.toLowerCase().replaceAll('_', ' ');
  }
  protected newTicket(): void {
    this.form = {
      subject: '',
      description: '',
      category: 'OTHER',
      priority: 'NORMAL'
    };
    this.createError.set('');
    this.creating.set(true);
  }
  protected async load(page = 0): Promise<void> {
    const request = ++this.listRequest;
    this.loading.set(true);
    this.error.set('');
    const params = new HttpParams({
      fromObject: { query: this.query, status: this.status, page, size: 25 }
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
      if (request === this.detailRequest) this.detail.set(response.data);
    } catch (error) {
      if (request === this.detailRequest)
        this.detailError.set(this.message(error));
    } finally {
      if (request === this.detailRequest) this.detailLoading.set(false);
    }
  }
  protected async create(): Promise<void> {
    if (
      this.saving() ||
      !this.form.subject.trim() ||
      !this.form.description.trim()
    )
      return;
    this.saving.set(true);
    this.createError.set('');
    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<SupportTicketDetail>>(this.base, {
          ...this.form,
          subject: this.form.subject.trim(),
          description: this.form.description.trim()
        })
      );
      this.creating.set(false);
      this.detail.set(response.data);
      this.reply = '';
      this.status = 'UNRESOLVED';
      await this.load(0);
    } catch (error) {
      this.createError.set(this.message(error));
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
          { body: this.reply.trim() }
        )
      );
      this.detail.set(response.data);
      this.reply = '';
      await this.load(this.page().page);
    } catch (error) {
      this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  protected async closeTicket(): Promise<void> {
    const selected = this.detail();
    if (
      !selected ||
      this.saving() ||
      !confirm('Close this support ticket? A later reply will reopen it.')
    )
      return;
    this.saving.set(true);
    this.detailError.set('');
    try {
      const response = await firstValueFrom(
        this.http.post<ApiResponse<SupportTicketDetail>>(
          `${this.base}/${selected.ticket.id}/close`,
          { version: selected.ticket.version }
        )
      );
      this.detail.set(response.data);
      await this.load(this.page().page);
    } catch (error) {
      this.detailError.set(this.message(error));
    } finally {
      this.saving.set(false);
    }
  }
  private message(error: unknown): string {
    return error instanceof HttpErrorResponse
      ? error.error?.error?.message ||
          'Unable to complete this support request.'
      : 'Unable to complete this support request.';
  }
}
