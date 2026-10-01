import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  BulkInvoicePreviewRecord,
  BulkInvoicePreviewRequest,
  CreateBatchInvoiceRequest,
  CreateBulkInvoicesRequest,
  CreateBulkInvoicesResponse,
  InvoiceRecord,
  InvoiceLineRequest,
  RecordInvoicePaymentRequest,
  UpdateInvoiceStatusRequest,
  OwnerStatementRecord,
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

  createBatch(request: CreateBatchInvoiceRequest) {
    return this.http
      .post<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/batch`, request)
      .pipe(map((response) => response.data));
  }

  previewBulk(request: BulkInvoicePreviewRequest) {
    return this.http
      .post<ApiResponse<BulkInvoicePreviewRecord>>(`${environment.apiBaseUrl}/tenant/invoices/bulk/preview`, request)
      .pipe(map((response) => response.data));
  }

  createBulk(request: CreateBulkInvoicesRequest) {
    return this.http
      .post<ApiResponse<CreateBulkInvoicesResponse>>(`${environment.apiBaseUrl}/tenant/invoices/bulk`, request)
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

  updateLine(invoiceId: string, lineId: string, request: InvoiceLineRequest) {
    return this.http
      .patch<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/lines/${lineId}`, request)
      .pipe(map((response) => response.data));
  }

  deleteLine(invoiceId: string, lineId: string) {
    return this.http
      .delete<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/lines/${lineId}`)
      .pipe(map((response) => response.data));
  }

  updateStatus(invoiceId: string, request: UpdateInvoiceStatusRequest) {
    return this.http
      .patch<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/status`, request)
      .pipe(map((response) => response.data));
  }

  recordPayment(invoiceId: string, request: RecordInvoicePaymentRequest) {
    return this.http
      .post<ApiResponse<InvoiceRecord>>(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/payments`, request)
      .pipe(map((response) => response.data));
  }

  ownerStatement(ownerId: string) {
    return this.http
      .get<ApiResponse<OwnerStatementRecord>>(`${environment.apiBaseUrl}/tenant/invoices/owners/${ownerId}/statement`)
      .pipe(map((response) => response.data));
  }

  downloadPdf(invoiceId: string) {
    return this.http
      .get(`${environment.apiBaseUrl}/tenant/invoices/${invoiceId}/pdf`, { responseType: 'blob' });
  }
}
