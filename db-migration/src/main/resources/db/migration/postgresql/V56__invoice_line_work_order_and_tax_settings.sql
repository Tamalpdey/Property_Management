ALTER TABLE invoice_lines
    ADD COLUMN IF NOT EXISTS work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_work_order
    ON invoice_lines (tenant_id, invoice_id, work_order_id);

UPDATE invoice_lines il
SET work_order_id = i.work_order_id
FROM invoices i
WHERE i.tenant_id = il.tenant_id
  AND i.id = il.invoice_id
  AND il.work_order_id IS NULL
  AND i.work_order_id IS NOT NULL;

ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS invoice_tax_rate numeric(5, 4) NOT NULL DEFAULT 0.13;

UPDATE invoice_lines il
SET taxable = true,
    tax_rate = coalesce(ts.invoice_tax_rate, 0.13),
    updated_at = now()
FROM invoices i
LEFT JOIN tenant_settings ts ON ts.tenant_id = i.tenant_id
WHERE i.tenant_id = il.tenant_id
  AND i.id = il.invoice_id
  AND i.status = 'DRAFT'
  AND il.line_type IN ('LABOR', 'MATERIAL')
  AND il.line_total > 0
  AND il.taxable = false
  AND il.tax_rate = 0;

UPDATE invoices i
SET subtotal = totals.subtotal,
    tax_total = totals.tax_total,
    total = totals.subtotal + totals.tax_total,
    updated_at = now()
FROM (
    SELECT tenant_id,
           invoice_id,
           coalesce(sum(line_total), 0)::numeric(12, 2) AS subtotal,
           coalesce(sum(CASE WHEN taxable THEN greatest(line_total, 0) * tax_rate ELSE 0 END), 0)::numeric(12, 2) AS tax_total
    FROM invoice_lines
    GROUP BY tenant_id, invoice_id
) totals
WHERE i.tenant_id = totals.tenant_id
  AND i.id = totals.invoice_id
  AND i.status = 'DRAFT';
