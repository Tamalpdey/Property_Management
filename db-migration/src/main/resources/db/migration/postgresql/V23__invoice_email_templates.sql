CREATE TABLE email_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_key text NOT NULL,
    name text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_email_templates_key UNIQUE (tenant_id, template_key)
);

CREATE INDEX idx_email_templates_tenant_active ON email_templates (tenant_id, active);

CREATE TABLE email_delivery_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
    invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
    customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
    recipient_email text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text NOT NULL DEFAULT 'RECORDED',
    provider_message text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_email_delivery_logs_invoice ON email_delivery_logs (tenant_id, invoice_id, created_at DESC);
CREATE INDEX idx_email_delivery_logs_customer ON email_delivery_logs (tenant_id, customer_id, created_at DESC);
