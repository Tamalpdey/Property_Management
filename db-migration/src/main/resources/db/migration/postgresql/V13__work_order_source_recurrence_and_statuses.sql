ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'TO_DO';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'ON_HOLD';
ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'PENDING_COMPLETION';

CREATE TYPE work_order_source AS ENUM ('ADHOC_CALL', 'RECURRING', 'WEBSITE', 'TENANT_PORTAL', 'CUSTOMER_PORTAL');

ALTER TABLE work_orders
    ADD COLUMN source work_order_source NOT NULL DEFAULT 'TENANT_PORTAL',
    ADD COLUMN requester_name text,
    ADD COLUMN requester_email citext,
    ADD COLUMN requester_phone text,
    ADD COLUMN requested_at timestamptz,
    ADD COLUMN recurrence_rule text,
    ADD COLUMN recurrence_interval integer,
    ADD COLUMN recurrence_until date,
    ADD COLUMN recurrence_parent_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX idx_work_orders_source ON work_orders (tenant_id, source);
CREATE INDEX idx_work_orders_recurrence_parent ON work_orders (tenant_id, recurrence_parent_id);
