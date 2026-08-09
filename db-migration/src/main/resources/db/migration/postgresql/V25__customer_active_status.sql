ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customers_tenant_active
    ON customers (tenant_id, active, display_name);
