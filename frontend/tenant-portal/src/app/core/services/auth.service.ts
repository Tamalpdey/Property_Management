import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiResponse, CurrentUser, LoginRequest, LoginResponse } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly currentUserSignal = signal<CurrentUser | null>(this.readUser());
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null);

  async login(request: LoginRequest): Promise<CurrentUser> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<LoginResponse>>(`${environment.apiBaseUrl}/auth/login`, request)
    );
    const session = response.data;
    this.persistSession(session);
    return session.user;
  }

  signOut(): void {
    localStorage.removeItem('lorne.accessToken');
    localStorage.removeItem('lorne.tenantId');
    localStorage.removeItem('lorne.user');
    this.currentUserSignal.set(null);
  }

  private persistSession(session: LoginResponse): void {
    localStorage.setItem('lorne.accessToken', session.accessToken);
    localStorage.setItem('lorne.tenantId', session.user.tenantId ?? '');
    localStorage.setItem('lorne.user', JSON.stringify(session.user));
    this.currentUserSignal.set(session.user);
  }

  private readUser(): CurrentUser | null {
    const raw = localStorage.getItem('lorne.user');
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  }
}
