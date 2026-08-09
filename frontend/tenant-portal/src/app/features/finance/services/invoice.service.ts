import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  ApiResponse,
  InvoiceLineRequest,
  InvoiceRecord,
  SendInvoiceEmailRequest,
  SendInvoiceEmailResponse
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<InvoiceRecord[]>>(`${environment.apiBaseUrl}/tenant/invoices`)
      .pipe(map((response) => response.data));
  }

  get(invoiceId: string) {
    return this.http
      .get<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}`)
      .pipe(map((response) => response.data));
  }

  sendEmail(invoiceId: string, request: SendInvoiceEmailRequest) {
    return this.http
      .post<ApiResponse<SendInvoiceEmailResponse>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/email`, request)
      .pipe(map((response) => response.data));
  }

  addLine(invoiceId: string, request: InvoiceLineRequest) {
    return this.http
      .post<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/lines`, request)
      .pipe(map((response) => response.data));
  }

  deleteLine(invoiceId: string, lineId: string) {
    return this.http
      .delete<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/lines/${lineId}`)
      .pipe(map((response) => response.data));
  }

  downloadPdf(invoiceId: string) {
    return this.http
      .get(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  }
}
