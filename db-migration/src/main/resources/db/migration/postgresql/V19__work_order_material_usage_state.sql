ALTER TABLE work_order_materials
    ADD COLUMN used boolean NOT NULL DEFAULT false,
    ADD COLUMN used_at timestamptz,
    ADD COLUMN used_by uuid REFERENCES app_users(id) ON DELETE SET NULL;

CREATE INDEX idx_work_order_materials_usage ON work_order_materials (tenant_id, work_order_id, used);
