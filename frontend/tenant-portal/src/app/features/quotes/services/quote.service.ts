import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { ApiResponse, PublicQuote, QuoteRecord, SendQuoteRequest, UpsertQuoteRequest, QuotePhoto, QuoteSiteDetails, QuoteCaptureLink, QuoteCaptureView, QuoteSiteNote, QuoteTemplate } from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class QuoteService {
  private readonly http = inject(HttpClient);
  templates() {
    return this.http.get<ApiResponse<QuoteTemplate[]>>(`${environment.apiBaseUrl}/tenant/quotes/templates`).pipe(map(response => response.data));
  }

  siteDetails(id: string) {
    return this.http.get<ApiResponse<QuoteSiteDetails>>(`${environment.apiBaseUrl}/tenant/quotes/${id}/site-visit`).pipe(map(r => r.data));
  }

  captureLink(id: string, accessPassword: string) {
    return this.http.post<ApiResponse<QuoteCaptureLink>>(`${environment.apiBaseUrl}/tenant/quotes/${id}/site-visit/link`, { accessPassword }).pipe(map(r => r.data));
  }

  revokeCapture(id: string) {
    return this.http.post(`${environment.apiBaseUrl}/tenant/quotes/${id}/site-visit/revoke`, {});
  }

  siteNote(id: string, authorName: string, body: string) {
    return this.http.post<ApiResponse<QuoteSiteNote>>(`${environment.apiBaseUrl}/tenant/quotes/${id}/site-visit/notes`, { authorName, body }).pipe(map(r => r.data));
  }

  captureView(token: string, password: string) {
    return this.http.get<ApiResponse<QuoteCaptureView>>(this.captureBase(token), { headers: this.quoteHeaders(password) }).pipe(map(r => r.data));
  }

  captureNote(token: string, password: string, authorName: string, body: string) {
    return this.http.post<ApiResponse<QuoteSiteNote>>(`${this.captureBase(token)}/notes`, { authorName, body }, { headers: this.quoteHeaders(password) }).pipe(map(r => r.data));
  }

  uploadQuotePhoto(id: string, file: File, caption: string, clientVisible: boolean, authorName: string, uploadId: string) {
    return this.http.post<ApiResponse<QuotePhoto>>(`${environment.apiBaseUrl}/tenant/quotes/${id}/photos`, this.photoForm(file, caption, clientVisible, authorName, uploadId)).pipe(map(r => r.data));
  }

  uploadCapturePhoto(token: string, password: string, file: File, caption: string, clientVisible: boolean, authorName: string, uploadId: string) {
    return this.http.post<ApiResponse<QuotePhoto>>(`${this.captureBase(token)}/photos`, this.photoForm(file, caption, clientVisible, authorName, uploadId), { headers: this.quoteHeaders(password) }).pipe(map(r => r.data));
  }

  updatePhoto(id: string, photo: QuotePhoto) {
    return this.http.patch(`${environment.apiBaseUrl}/tenant/quotes/${id}/photos/${photo.id}`, { caption: photo.caption, clientVisible: photo.clientVisible });
  }

  deletePhoto(id: string, photoId: string) {
    return this.http.delete(`${environment.apiBaseUrl}/tenant/quotes/${id}/photos/${photoId}`);
  }

  photoImage(id: string, photoId: string) {
    return this.http.get(`${environment.apiBaseUrl}/tenant/quotes/${id}/photos/${photoId}/image`, { responseType: 'blob' });
  }

  publicPhotos(token: string, password: string) {
    return this.http.get<ApiResponse<QuotePhoto[]>>(`${environment.apiBaseUrl}/public/quotes/${encodeURIComponent(token)}/photos`, { headers: this.quoteHeaders(password) }).pipe(map(r => r.data));
  }

  publicPhotoImage(token: string, password: string, photoId: string, capture = false) {
    const base = capture ? this.captureBase(token) : `${environment.apiBaseUrl}/public/quotes/${encodeURIComponent(token)}`;
    return this.http.get(`${base}/photos/${photoId}/image`, { responseType: 'blob', headers: this.quoteHeaders(password) });
  }

  private captureBase(token: string) { return `${environment.apiBaseUrl}/public/quotes/capture/${encodeURIComponent(token)}`; }
  private quoteHeaders(password: string) { return new HttpHeaders({ 'X-Quote-Password': password }); }
  private photoForm(file: File, caption: string, clientVisible: boolean, authorName: string, uploadId: string) {
    const data = new FormData(); data.set('file', file); data.set('caption', caption);
    data.set('clientVisible', String(clientVisible)); data.set('authorName', authorName); data.set('uploadId', uploadId); return data;
  }

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

  sharing(quoteId: string) {
    return this.http.get<ApiResponse<{ publicUrl?: string; passwordSet: boolean }>>(`${environment.apiBaseUrl}/tenant/quotes/${quoteId}/sharing`)
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
