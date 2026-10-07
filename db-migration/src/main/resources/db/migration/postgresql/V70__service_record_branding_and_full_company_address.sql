ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS address_line2 text,
    ADD COLUMN IF NOT EXISTS service_record_show_company_name boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS service_record_show_company_address boolean NOT NULL DEFAULT false;
