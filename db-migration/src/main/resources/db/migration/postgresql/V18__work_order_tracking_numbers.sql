ALTER TABLE work_orders
    ADD COLUMN work_order_number text;

UPDATE work_orders
SET work_order_number = 'WO-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
WHERE work_order_number IS NULL;

ALTER TABLE work_orders
    ALTER COLUMN work_order_number SET NOT NULL;

CREATE UNIQUE INDEX uk_work_orders_tenant_number
    ON work_orders (tenant_id, work_order_number);

CREATE INDEX idx_work_orders_number_search
    ON work_orders (tenant_id, lower(work_order_number));
