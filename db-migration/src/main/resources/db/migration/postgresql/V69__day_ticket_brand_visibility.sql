ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS day_ticket_show_company_name boolean NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS day_ticket_show_company_address boolean NOT NULL DEFAULT true;
