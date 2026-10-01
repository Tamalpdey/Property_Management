ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS unit_cost numeric(12, 2);
