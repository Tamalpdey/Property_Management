ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS tax_registration_number text;
