CREATE TABLE invoice_work_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    CONSTRAINT uk_invoice_work_order UNIQUE (tenant_id, invoice_id, work_order_id)
);

CREATE INDEX idx_invoice_work_orders_invoice ON invoice_work_orders (tenant_id, invoice_id);
CREATE INDEX idx_invoice_work_orders_work_order ON invoice_work_orders (tenant_id, work_order_id);

INSERT INTO invoice_work_orders (tenant_id, invoice_id, work_order_id, created_by)
SELECT tenant_id, id, work_order_id, created_by
FROM invoices
WHERE work_order_id IS NOT NULL
ON CONFLICT DO NOTHING;
