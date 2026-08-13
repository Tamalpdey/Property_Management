ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

