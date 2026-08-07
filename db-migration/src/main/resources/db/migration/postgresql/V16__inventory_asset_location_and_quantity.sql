ALTER TABLE inventory_items
    ADD COLUMN storage_location text;

ALTER TABLE assets
    ADD COLUMN storage_location text,
    ADD COLUMN quantity_on_hand numeric(12, 2) NOT NULL DEFAULT 1;

CREATE INDEX idx_inventory_items_location ON inventory_items (tenant_id, storage_location);
CREATE INDEX idx_assets_location ON assets (tenant_id, storage_location);
