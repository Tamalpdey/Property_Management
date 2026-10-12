import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, PublicQuote, QuoteRecord, SendQuoteRequest, UpsertQuoteRequest } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly http = inject(HttpClient);

  list(search = '', status = 'ALL') {
    let params = new HttpParams().set('status', status);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<ApiResponse<QuoteRecord[]>>(`${environment.apiBaseUrl}/tenant/quotes`, { params })
      .pipe(map((response) => response.data));
  }

  create(request: UpsertQuoteRequest) {
    return this.http.post<ApiResponse<QuoteRecord>>(`${environment.apiBaseUrl}/tenant/quotes`, request)
      .pipe(map((response) => response.data));
  }

  update(quoteId: string, request: UpsertQuoteRequest) {
    return this.http.patch<ApiResponse<QuoteRecord>>(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}`, request)
      .pipe(map((response) => response.data));
  }

  send(quoteId: string, request: SendQuoteRequest) {
    return this.http.post<ApiResponse<{ status: string; recipient: string; sentAt?: string; publicUrl: string }>>(
      `${environment.apiBaseUrl}/tenant/quotes/${quoteId}/send`,
      request
    ).pipe(map((response) => response.data));
  }

  share(quoteId: string, accessPassword: string) {
    return this.http.post<ApiResponse<{ publicUrl: string }>>(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}/share`, { accessPassword })
      .pipe(map((response) => response.data));
  }

  downloadPdf(quoteId: string) {
    return this.http.get(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}/pdf`, { responseType: 'blob' });
  }

  publicPdf(token: string, password: string) {
    return this.http.get(`${environment.apiBaseUrl}/public/quotes/${encodeURIComponent(token)}/pdf`, {
      responseType: 'blob', headers: new HttpHeaders({ 'X-Quote-Password': password })
    });
  }

  convert(quoteId: string, propertyId?: string) {
    return this.http.post<ApiResponse<QuoteRecord>>(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}/convert`, { propertyId })
      .pipe(map((response) => response.data));
  }

  void(quoteId: string) {
    return this.http.post<ApiResponse<QuoteRecord>>(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}/void`, {})
      .pipe(map((response) => response.data));
  }

  publicQuote(token: string, password: string) {
    return this.http.get<ApiResponse<PublicQuote>>(`${environment.apiBaseUrl}/public/quotes/${encodeURIComponent(token)}`, {
      headers: new HttpHeaders({ 'X-Quote-Password': password })
    })
      .pipe(map((response) => response.data));
  }

  decide(token: string, password: string, decision: 'approve' | 'decline', request: { name: string; comment?: string }) {
    return this.http.post<ApiResponse<PublicQuote>>(
      `${environment.apiBaseUrl}/public/quotes/${encodeURIComponent(token)}/${decision}`,
      request, { headers: new HttpHeaders({ 'X-Quote-Password': password }) }
    ).pipe(map((response) => response.data));
  }
}
