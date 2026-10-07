ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS invoice_show_company_name boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS invoice_show_company_address boolean NOT NULL DEFAULT false;
