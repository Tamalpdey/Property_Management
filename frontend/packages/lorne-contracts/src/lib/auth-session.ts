export function authSessionExpiresAt(expiresInSeconds: number, issuedAtMillis = Date.now()): string {
  return new Date(issuedAtMillis + expiresInSeconds * 1000).toISOString();
}

export function isAuthSessionExpired(expiresAt?: string | null, clockSkewMillis = 60_000, nowMillis = Date.now()): boolean {
  if (!expiresAt) {
    return true;
  }
  const expiresAtMillis = Date.parse(expiresAt);
  return Number.isNaN(expiresAtMillis) || expiresAtMillis <= nowMillis + clockSkewMillis;
}

export function jwtExpiresAt(token?: string | null): string | null {
  if (!token) {
    return null;
  }
  const [, payload] = token.split('.');
  if (!payload) {
    return null;
  }
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const claims = JSON.parse(atob(padded)) as { exp?: number };
    return claims.exp ? new Date(claims.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

export function resolveAuthSessionExpiry(token?: string | null, storedExpiresAt?: string | null): string | null {
  return storedExpiresAt || jwtExpiresAt(token);
}
