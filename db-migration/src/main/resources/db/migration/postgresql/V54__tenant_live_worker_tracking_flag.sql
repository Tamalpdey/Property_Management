ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS live_worker_tracking_enabled boolean NOT NULL DEFAULT false;
