import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { CurrentUser, ApiResponse, LoginRequest, LoginResponse } from '@lorne/contracts';
import { firstValueFrom } from 'rxjs';
import { authSessionExpiresAt, isAuthSessionExpired, resolveAuthSessionExpiry } from '../../../../../packages/lorne-contracts/src/lib/auth-session';
import { environment } from '../../../environments/environment';

const ACCESS_TOKEN_KEY = 'lorne.workerAccessToken';
const REFRESH_TOKEN_KEY = 'lorne.workerRefreshToken';
const TENANT_ID_KEY = 'lorne.workerTenantId';
const USER_KEY = 'lorne.workerUser';
const EXPIRES_AT_KEY = 'lorne.workerExpiresAt';
const REFRESH_EXPIRES_AT_KEY = 'lorne.workerRefreshExpiresAt';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly hadStoredSessionAtStartup = this.hasStoredSessionEvidence();
  private readonly currentUserSignal = signal<CurrentUser | null>(this.readUser());
  private refreshPromise: Promise<string | null> | null = null;
  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUserSignal() !== null && this.isStoredTokenUsable());

  async login(request: LoginRequest): Promise<CurrentUser> {
    const response = await firstValueFrom(
      this.http.post<ApiResponse<LoginResponse>>(`${environment.apiBaseUrl}/auth/login`, request)
    );
    const session = response.data;
    this.persistSession(session);
    return session.user;
  }

  signOut(): void {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (refreshToken) {
      void firstValueFrom(
        this.http.post<ApiResponse<void>>(`${environment.apiBaseUrl}/auth/logout`, { refreshToken })
      ).catch(() => undefined);
    }
    this.clearSession();
  }

  clearSession(): void {
    this.removeStoredSession();
    this.currentUserSignal.set(null);
  }

  private removeStoredSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TENANT_ID_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    localStorage.removeItem(REFRESH_EXPIRES_AT_KEY);
  }

  accessToken(): string | null {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = resolveAuthSessionExpiry(token, localStorage.getItem(EXPIRES_AT_KEY));
    if (!token || isAuthSessionExpired(expiresAt)) {
      return null;
    }
    return token;
  }

  async validAccessToken(): Promise<string | null> {
    const token = this.accessToken();
    if (token) {
      return token;
    }
    return this.refreshSession();
  }

  hasValidSession(): boolean {
    return (this.accessToken() !== null || this.hasRefreshSession()) && this.currentUserSignal() !== null;
  }

  shouldShowExpiredSessionMessage(): boolean {
    return this.hadStoredSessionAtStartup;
  }

  tenantId(): string | null {
    return this.hasValidSession() ? localStorage.getItem(TENANT_ID_KEY) : null;
  }

  private persistSession(session: LoginResponse): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    localStorage.setItem(TENANT_ID_KEY, session.user.tenantId ?? '');
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    localStorage.setItem(EXPIRES_AT_KEY, authSessionExpiresAt(session.expiresInSeconds));
    localStorage.setItem(REFRESH_EXPIRES_AT_KEY, authSessionExpiresAt(session.refreshExpiresInSeconds));
    this.currentUserSignal.set(session.user);
  }

  private readUser(): CurrentUser | null {
    const raw = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = resolveAuthSessionExpiry(token, localStorage.getItem(EXPIRES_AT_KEY));
    if (!raw || !token || (isAuthSessionExpired(expiresAt) && !this.hasRefreshSession())) {
      this.removeStoredSession();
      return null;
    }
    try {
      return JSON.parse(raw) as CurrentUser;
    } catch {
      this.removeStoredSession();
      return null;
    }
  }

  private isStoredTokenUsable(): boolean {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const expiresAt = resolveAuthSessionExpiry(token, localStorage.getItem(EXPIRES_AT_KEY));
    return !!token && !isAuthSessionExpired(expiresAt);
  }

  private hasRefreshSession(): boolean {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    return !!refreshToken && !isAuthSessionExpired(localStorage.getItem(REFRESH_EXPIRES_AT_KEY), 0);
  }

  private hasStoredSessionEvidence(): boolean {
    return !!localStorage.getItem(ACCESS_TOKEN_KEY)
      || !!localStorage.getItem(REFRESH_TOKEN_KEY)
      || !!localStorage.getItem(USER_KEY);
  }

  private refreshSession(): Promise<string | null> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken || !this.hasRefreshSession()) {
      this.clearSession();
      return Promise.resolve(null);
    }

    this.refreshPromise = firstValueFrom(
      this.http.post<ApiResponse<LoginResponse>>(`${environment.apiBaseUrl}/auth/refresh`, { refreshToken })
    )
      .then((response) => {
        this.persistSession(response.data);
        return response.data.accessToken;
      })
      .catch(() => {
        this.clearSession();
        return null;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }
}
