ALTER TABLE email_delivery_logs
    ADD COLUMN work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;

CREATE INDEX idx_email_delivery_logs_work_order
    ON email_delivery_logs (tenant_id, work_order_id, created_at DESC);
