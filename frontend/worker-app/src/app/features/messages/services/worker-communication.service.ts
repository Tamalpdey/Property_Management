import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  ConversationRecord,
  ConversationThread,
  CreateConversationRequest,
  SendMessageRequest
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class WorkerCommunicationService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http
      .get<ApiResponse<ConversationRecord[]>>(`${environment.apiBaseUrl}/field-worker/communications`)
      .pipe(map((response) => response.data));
  }

  openOperationsThread(request: CreateConversationRequest = {}) {
    return this.http
      .post<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/field-worker/communications/operations`, request)
      .pipe(map((response) => response.data));
  }

  thread(conversationId: string) {
    return this.http
      .get<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/field-worker/communications/${conversationId}`)
      .pipe(map((response) => response.data));
  }

  send(conversationId: string, body: string) {
    const request: SendMessageRequest = { body };
    return this.http
      .post<ApiResponse<ConversationThread['messages'][number]>>(`${environment.apiBaseUrl}/field-worker/communications/${conversationId}/messages`, request)
      .pipe(map((response) => response.data));
  }

  markRead(conversationId: string) {
    return this.http
      .post<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/field-worker/communications/${conversationId}/read`, {})
      .pipe(map((response) => response.data));
  }
}
