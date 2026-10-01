UPDATE invoice_lines il
SET work_order_id = single_work_order.work_order_id,
    updated_at = now()
FROM (
    SELECT tenant_id,
           invoice_id,
           (array_agg(work_order_id ORDER BY work_order_id::text))[1] AS work_order_id
    FROM invoice_work_orders
    GROUP BY tenant_id, invoice_id
    HAVING count(*) = 1
) single_work_order
WHERE il.tenant_id = single_work_order.tenant_id
  AND il.invoice_id = single_work_order.invoice_id
  AND il.work_order_id IS NULL;

UPDATE invoice_lines il
SET work_order_id = wo.id,
    updated_at = now()
FROM invoice_work_orders iwo
JOIN work_orders wo ON wo.tenant_id = iwo.tenant_id AND wo.id = iwo.work_order_id
WHERE il.tenant_id = iwo.tenant_id
  AND il.invoice_id = iwo.invoice_id
  AND il.work_order_id IS NULL
  AND il.description ILIKE '%' || wo.work_order_number || '%';

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
