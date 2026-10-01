CREATE TABLE IF NOT EXISTS worker_vehicle_usage (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    usage_date date NOT NULL,
    vehicle_asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
    vehicle_label text,
    start_km numeric(12, 1),
    end_km numeric(12, 1),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app_users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_users(id),
    CONSTRAINT uq_worker_vehicle_usage_day UNIQUE (tenant_id, worker_id, usage_date),
    CONSTRAINT ck_worker_vehicle_usage_start_km CHECK (start_km IS NULL OR start_km >= 0),
    CONSTRAINT ck_worker_vehicle_usage_end_km CHECK (end_km IS NULL OR end_km >= 0),
    CONSTRAINT ck_worker_vehicle_usage_range CHECK (start_km IS NULL OR end_km IS NULL OR end_km >= start_km)
);

CREATE INDEX IF NOT EXISTS idx_worker_vehicle_usage_worker_date
    ON worker_vehicle_usage (tenant_id, worker_id, usage_date DESC);

