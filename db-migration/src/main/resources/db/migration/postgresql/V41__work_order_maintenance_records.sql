CREATE TABLE IF NOT EXISTS work_order_maintenance_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    worker_id uuid REFERENCES workers(id),
    actor_user_id uuid REFERENCES app_users(id),
    template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    record_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app_users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_users(id),
    CONSTRAINT uq_work_order_maintenance_records_worker_user
        UNIQUE (tenant_id, work_order_id, actor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_work_order_maintenance_records_work_order
    ON work_order_maintenance_records (tenant_id, work_order_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_work_order_maintenance_records_worker
    ON work_order_maintenance_records (tenant_id, worker_id, updated_at DESC);
