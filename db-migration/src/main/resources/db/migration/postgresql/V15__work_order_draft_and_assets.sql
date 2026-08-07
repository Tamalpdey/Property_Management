ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'DRAFT';

CREATE TABLE work_order_assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_work_order_asset UNIQUE (tenant_id, work_order_id, asset_id)
);

CREATE INDEX idx_work_order_assets_work_order ON work_order_assets (tenant_id, work_order_id);
CREATE INDEX idx_work_order_assets_asset ON work_order_assets (tenant_id, asset_id);
CREATE INDEX idx_work_order_materials_work_order ON work_order_materials (tenant_id, work_order_id);
