ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS auto_send_work_completed_email boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS auto_send_invoice_email boolean NOT NULL DEFAULT false;

ALTER TABLE email_delivery_logs
    ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'MANUAL';

ALTER TABLE email_delivery_logs
    ADD CONSTRAINT ck_email_delivery_logs_delivery_mode
    CHECK (delivery_mode IN ('AUTO', 'MANUAL', 'RESEND', 'TEST'));

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_tenant_created
    ON email_delivery_logs (tenant_id, created_at DESC);
