ALTER TABLE work_order_route_stops
    ADD COLUMN arrived_at timestamptz,
    ADD COLUMN skipped_at timestamptz,
    ADD COLUMN skipped_reason text,
    ADD COLUMN arrived_by uuid,
    ADD COLUMN completed_by uuid,
    ADD COLUMN skipped_by uuid;

CREATE INDEX idx_work_order_route_stops_execution
    ON work_order_route_stops (tenant_id, work_order_id, completed_at, skipped_at);
