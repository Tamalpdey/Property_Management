ALTER TABLE service_categories
    ADD COLUMN IF NOT EXISTS wsib_rate_percent numeric(7, 4);
