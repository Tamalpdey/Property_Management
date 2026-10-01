WITH void_invoice_work_orders AS (
    SELECT i.tenant_id, i.work_order_id
    FROM invoices i
    WHERE i.status = 'VOID'
      AND i.work_order_id IS NOT NULL
    UNION
    SELECT iwo.tenant_id, iwo.work_order_id
    FROM invoice_work_orders iwo
    JOIN invoices i ON i.id = iwo.invoice_id AND i.tenant_id = iwo.tenant_id
    WHERE i.status = 'VOID'
)
UPDATE work_orders wo
SET status = 'APPROVED'::work_order_status,
    updated_at = now()
FROM void_invoice_work_orders voided
WHERE voided.tenant_id = wo.tenant_id
  AND voided.work_order_id = wo.id
  AND wo.status = 'INVOICED'::work_order_status
  AND NOT EXISTS (
      SELECT 1
      FROM invoices active_invoice
      WHERE active_invoice.tenant_id = wo.tenant_id
        AND active_invoice.status <> 'VOID'
        AND (
          active_invoice.work_order_id = wo.id
          OR EXISTS (
              SELECT 1
              FROM invoice_work_orders active_link
              WHERE active_link.tenant_id = active_invoice.tenant_id
                AND active_link.invoice_id = active_invoice.id
                AND active_link.work_order_id = wo.id
          )
        )
  );

