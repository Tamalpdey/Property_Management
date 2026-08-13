CREATE TABLE auth_refresh_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    client_type text NOT NULL,
    source text,
    expires_at timestamptz NOT NULL,
    last_used_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_refresh_sessions_user_active
    ON auth_refresh_sessions (user_id, tenant_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX idx_auth_refresh_sessions_expiry
    ON auth_refresh_sessions (expires_at)
    WHERE revoked_at IS NULL;
