WITH work_order_matches AS (
    SELECT il.tenant_id,
           il.invoice_id,
           il.id AS line_id,
           wo.id AS work_order_id,
           count(*) OVER (PARTITION BY il.tenant_id, il.invoice_id, il.id) AS match_count
    FROM invoice_lines il
    JOIN invoice_work_orders iwo ON iwo.tenant_id = il.tenant_id AND iwo.invoice_id = il.invoice_id
    JOIN work_orders wo ON wo.tenant_id = iwo.tenant_id AND wo.id = iwo.work_order_id
    WHERE il.description ILIKE '%' || wo.work_order_number || '%'
)
UPDATE invoice_lines il
SET work_order_id = work_order_matches.work_order_id,
    updated_at = now()
FROM work_order_matches
WHERE il.tenant_id = work_order_matches.tenant_id
  AND il.invoice_id = work_order_matches.invoice_id
  AND il.id = work_order_matches.line_id
  AND work_order_matches.match_count = 1
  AND il.work_order_id IS DISTINCT FROM work_order_matches.work_order_id;

WITH material_matches AS (
    SELECT il.tenant_id,
           il.invoice_id,
           il.id AS line_id,
           wom.work_order_id,
           count(*) OVER (PARTITION BY il.tenant_id, il.invoice_id, il.id) AS match_count
    FROM invoice_lines il
    JOIN invoice_work_orders iwo ON iwo.tenant_id = il.tenant_id AND iwo.invoice_id = il.invoice_id
    JOIN work_order_materials wom ON wom.tenant_id = iwo.tenant_id AND wom.work_order_id = iwo.work_order_id
    LEFT JOIN inventory_items ii ON ii.tenant_id = wom.tenant_id AND ii.id = wom.inventory_item_id
    WHERE il.line_type = 'MATERIAL'
      AND wom.used = true
      AND il.quantity = wom.quantity
      AND il.unit_price = coalesce(wom.unit_cost, 0)
      AND (
          il.description ILIKE '%' || coalesce(ii.name, wom.description) || '%'
          OR coalesce(ii.name, wom.description) ILIKE '%' || il.description || '%'
      )
)
UPDATE invoice_lines il
SET work_order_id = material_matches.work_order_id,
    updated_at = now()
FROM material_matches
WHERE il.tenant_id = material_matches.tenant_id
  AND il.invoice_id = material_matches.invoice_id
  AND il.id = material_matches.line_id
  AND material_matches.match_count = 1
  AND il.work_order_id IS DISTINCT FROM material_matches.work_order_id;

UPDATE invoice_lines il
SET taxable = true,
    tax_rate = coalesce(ts.invoice_tax_rate, 0.13),
    updated_at = now()
FROM invoices i
LEFT JOIN tenant_settings ts ON ts.tenant_id = i.tenant_id
WHERE i.tenant_id = il.tenant_id
  AND i.id = il.invoice_id
  AND i.status IN ('DRAFT', 'SENT', 'OVERDUE')
  AND NOT EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.tenant_id = i.tenant_id
        AND p.invoice_id = i.id
        AND p.status = 'RECEIVED'
  )
  AND il.line_type IN ('LABOR', 'MATERIAL')
  AND il.line_total > 0
  AND (il.taxable = false OR il.tax_rate = 0)
  AND coalesce(ts.invoice_tax_rate, 0.13) > 0;

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
  AND i.status IN ('DRAFT', 'SENT', 'OVERDUE')
  AND NOT EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.tenant_id = i.tenant_id
        AND p.invoice_id = i.id
        AND p.status = 'RECEIVED'
  );
