import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, EmailTemplateRecord, UpdateEmailTemplateRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class EmailTemplateService {
  private readonly http = inject(HttpClient);

  invoiceOwner() {
    return this.http
      .get<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/invoice-owner`)
      .pipe(map((response) => response.data));
  }

  workOrderCompletedOwner() {
    return this.http
      .get<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/work-order-completed-owner`)
      .pipe(map((response) => response.data));
  }

  updateInvoiceOwner(request: UpdateEmailTemplateRequest) {
    return this.http
      .put<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/invoice-owner`, request)
      .pipe(map((response) => response.data));
  }

  resetInvoiceOwner() {
    return this.http
      .post<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/invoice-owner/reset`, {})
      .pipe(map((response) => response.data));
  }

  updateWorkOrderCompletedOwner(request: UpdateEmailTemplateRequest) {
    return this.http
      .put<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/work-order-completed-owner`, request)
      .pipe(map((response) => response.data));
  }

  resetWorkOrderCompletedOwner() {
    return this.http
      .post<ApiResponse<EmailTemplateRecord>>(`${environment.apiBaseUrl}/tenant/email-templates/work-order-completed-owner/reset`, {})
      .pipe(map((response) => response.data));
  }
}
