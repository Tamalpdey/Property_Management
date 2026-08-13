ALTER TABLE work_orders
    ADD COLUMN work_order_type text NOT NULL DEFAULT 'SERVICE';

ALTER TABLE work_orders
    ADD CONSTRAINT ck_work_orders_type
        CHECK (work_order_type IN ('SERVICE', 'PICKUP_DELIVERY', 'INSPECTION', 'FOLLOW_UP'));

CREATE INDEX idx_work_orders_type ON work_orders (tenant_id, work_order_type);
