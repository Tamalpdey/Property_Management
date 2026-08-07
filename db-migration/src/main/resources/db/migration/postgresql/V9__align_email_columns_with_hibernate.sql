ALTER TABLE app_users
    ALTER COLUMN email TYPE text USING email::text;

ALTER TABLE customers
    ALTER COLUMN email TYPE text USING email::text,
    ALTER COLUMN billing_email TYPE text USING billing_email::text;

ALTER TABLE workers
    ALTER COLUMN email TYPE text USING email::text;

CREATE UNIQUE INDEX IF NOT EXISTS uk_app_users_email_lower ON app_users (lower(email));
CREATE INDEX IF NOT EXISTS idx_customers_tenant_email_lower ON customers (tenant_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workers_tenant_email_lower ON workers (tenant_id, lower(email)) WHERE email IS NOT NULL;
