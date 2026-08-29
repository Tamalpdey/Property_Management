import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  ApiResponse,
  CommunicationChannelType,
  ConversationRecord,
  ConversationThread,
  CreateConversationRequest,
  SendMessageRequest
} from '@lorne/contracts';
import { map } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface TenantConversationFilters {
  channelType?: CommunicationChannelType | 'ALL';
  workOrderId?: string;
}

@Injectable({ providedIn: 'root' })
export class CommunicationService {
  private readonly http = inject(HttpClient);

  list(filters: TenantConversationFilters = {}) {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => Boolean(value))) as Record<string, string>;
    return this.http
      .get<ApiResponse<ConversationRecord[]>>(`${environment.apiBaseUrl}/tenant/communications`, { params })
      .pipe(map((response) => response.data));
  }

  create(request: CreateConversationRequest) {
    return this.http
      .post<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/tenant/communications`, request)
      .pipe(map((response) => response.data));
  }

  thread(conversationId: string) {
    return this.http
      .get<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/tenant/communications/${conversationId}`)
      .pipe(map((response) => response.data));
  }

  send(conversationId: string, body: string) {
    const request: SendMessageRequest = { body };
    return this.http
      .post<ApiResponse<ConversationThread['messages'][number]>>(`${environment.apiBaseUrl}/tenant/communications/${conversationId}/messages`, request)
      .pipe(map((response) => response.data));
  }

  markRead(conversationId: string) {
    return this.http
      .post<ApiResponse<ConversationThread>>(`${environment.apiBaseUrl}/tenant/communications/${conversationId}/read`, {})
      .pipe(map((response) => response.data));
  }
}
