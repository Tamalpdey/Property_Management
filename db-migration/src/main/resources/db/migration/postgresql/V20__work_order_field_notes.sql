CREATE TABLE work_order_field_notes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
    note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX idx_work_order_field_notes_work_order ON work_order_field_notes (tenant_id, work_order_id, created_at DESC);
