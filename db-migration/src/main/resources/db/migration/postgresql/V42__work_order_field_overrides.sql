CREATE TABLE work_order_assignment_overrides (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    assignment_status work_order_assignment_status,
    actual_arrived_at timestamptz,
    actual_work_started_at timestamptz,
    actual_finished_at timestamptz,
    actual_work_minutes bigint,
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    CONSTRAINT uk_work_order_assignment_override UNIQUE (tenant_id, work_order_id, worker_id),
    CONSTRAINT ck_work_order_assignment_override_minutes CHECK (actual_work_minutes IS NULL OR actual_work_minutes >= 0)
);

CREATE INDEX idx_work_order_assignment_overrides_work_order
    ON work_order_assignment_overrides (tenant_id, work_order_id);
