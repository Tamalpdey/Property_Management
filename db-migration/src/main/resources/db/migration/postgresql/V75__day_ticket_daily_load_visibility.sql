ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS day_ticket_show_daily_loadout boolean NOT NULL DEFAULT false;
