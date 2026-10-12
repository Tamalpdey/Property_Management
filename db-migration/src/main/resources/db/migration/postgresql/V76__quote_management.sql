CREATE TABLE tenant_modules (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_code text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    enabled_at timestamptz,
    enabled_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, module_code),
    CONSTRAINT ck_tenant_modules_code CHECK (module_code IN ('QUOTES'))
);

CREATE TABLE quote_daily_sequences (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sequence_date date NOT NULL,
    last_value integer NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, sequence_date)
);

CREATE TABLE quotes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_number text NOT NULL,
    customer_id uuid REFERENCES customers(id) ON DELETE RESTRICT,
    adhoc_customer_name text,
    adhoc_customer_email citext,
    adhoc_customer_phone text,
    property_id uuid REFERENCES properties(id) ON DELETE RESTRICT,
    adhoc_property_name text,
    adhoc_property_address text,
    service_type_id uuid REFERENCES service_types(id) ON DELETE SET NULL,
    title text NOT NULL,
    scope text,
    status text NOT NULL DEFAULT 'DRAFT',
    issue_date date NOT NULL DEFAULT current_date,
    valid_until date,
    subtotal numeric(12, 2) NOT NULL DEFAULT 0,
    tax_rate numeric(7, 4) NOT NULL DEFAULT 0,
    tax_amount numeric(12, 2) NOT NULL DEFAULT 0,
    total numeric(12, 2) NOT NULL DEFAULT 0,
    notes text,
    terms text,
    approval_token_hash text,
    approval_name text,
    approval_comment text,
    sent_at timestamptz,
    viewed_at timestamptz,
    approved_at timestamptz,
    declined_at timestamptz,
    converted_at timestamptz,
    converted_work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_quotes_number UNIQUE (tenant_id, quote_number),
    CONSTRAINT uk_quotes_approval_token UNIQUE (approval_token_hash),
    CONSTRAINT ck_quotes_status CHECK (status IN ('DRAFT', 'SENT', 'VIEWED', 'APPROVED', 'DECLINED', 'EXPIRED', 'CONVERTED', 'VOID')),
    CONSTRAINT ck_quotes_dates CHECK (valid_until IS NULL OR valid_until >= issue_date),
    CONSTRAINT ck_quotes_customer_source CHECK (
        (customer_id IS NOT NULL AND adhoc_customer_name IS NULL)
        OR (customer_id IS NULL AND nullif(btrim(adhoc_customer_name), '') IS NOT NULL)
    ),
    CONSTRAINT ck_quotes_property_source CHECK (property_id IS NULL OR adhoc_property_name IS NULL),
    CONSTRAINT ck_quotes_amounts CHECK (subtotal >= 0 AND tax_amount >= 0 AND total >= 0),
    CONSTRAINT ck_quotes_tax_rate CHECK (tax_rate >= 0 AND tax_rate <= 1)
);

CREATE INDEX idx_quotes_tenant_status ON quotes (tenant_id, status, created_at DESC);
CREATE INDEX idx_quotes_customer ON quotes (tenant_id, customer_id, created_at DESC);
CREATE INDEX idx_quotes_property ON quotes (tenant_id, property_id, created_at DESC);

CREATE TABLE quote_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    description text NOT NULL,
    quantity numeric(12, 2) NOT NULL,
    unit text,
    rate numeric(12, 2) NOT NULL,
    amount numeric(12, 2) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT ck_quote_lines_quantity CHECK (quantity > 0),
    CONSTRAINT ck_quote_lines_rate CHECK (rate >= 0),
    CONSTRAINT ck_quote_lines_amount CHECK (amount >= 0)
);

CREATE INDEX idx_quote_lines_quote ON quote_lines (tenant_id, quote_id, sort_order);

ALTER TABLE email_delivery_logs
    ADD COLUMN quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL;

CREATE INDEX idx_email_delivery_logs_quote
    ON email_delivery_logs (tenant_id, quote_id, created_at DESC);
