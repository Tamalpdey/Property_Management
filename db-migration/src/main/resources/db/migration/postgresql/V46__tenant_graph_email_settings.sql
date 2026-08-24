ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS graph_tenant_id text,
    ADD COLUMN IF NOT EXISTS graph_client_id text,
    ADD COLUMN IF NOT EXISTS graph_client_secret text,
    ADD COLUMN IF NOT EXISTS graph_sender_user text;

ALTER TABLE tenant_settings
    DROP CONSTRAINT IF EXISTS ck_tenant_settings_email_provider;

ALTER TABLE tenant_settings
    ADD CONSTRAINT ck_tenant_settings_email_provider
        CHECK (email_provider IN ('SYSTEM', 'TENANT_SMTP', 'TENANT_GRAPH'));
