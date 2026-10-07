CREATE TABLE work_order_daily_sequences (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_date date NOT NULL,
    last_value integer NOT NULL CHECK (last_value > 0),
    PRIMARY KEY (tenant_id, work_order_date)
);

CREATE TEMP TABLE work_order_number_rewrite ON COMMIT DROP AS
SELECT id,
       tenant_id,
       created_at::date AS work_order_date,
       to_char(created_at, 'YYMMDD') || '-' || lpad(
           row_number() OVER (PARTITION BY tenant_id, created_at::date ORDER BY created_at, id)::text,
           4,
           '0'
       ) AS new_number
FROM work_orders;

UPDATE work_orders
SET work_order_number = 'TMP-' || replace(id::text, '-', '');

UPDATE work_orders wo
SET work_order_number = rewrite.new_number
FROM work_order_number_rewrite rewrite
WHERE rewrite.id = wo.id;

INSERT INTO work_order_daily_sequences (tenant_id, work_order_date, last_value)
SELECT tenant_id, work_order_date, count(*)::integer
FROM work_order_number_rewrite
GROUP BY tenant_id, work_order_date;
