CREATE TABLE invoice_daily_sequences (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_date date NOT NULL,
    last_value integer NOT NULL CHECK (last_value > 0),
    PRIMARY KEY (tenant_id, invoice_date)
);

