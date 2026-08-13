ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'OVERDUE';

ALTER TABLE invoice_lines
    ADD COLUMN IF NOT EXISTS line_type text NOT NULL DEFAULT 'CUSTOM',
    ADD COLUMN IF NOT EXISTS taxable boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS tax_rate numeric(5, 4) NOT NULL DEFAULT 0;

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'OTHER',
    ADD COLUMN IF NOT EXISTS note text;

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status ON invoices (tenant_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_paid_at ON payments (tenant_id, paid_at);
