CREATE TABLE worker_daily_activities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    activity_date date NOT NULL,
    activity_type text NOT NULL,
    title text NOT NULL,
    location_name text,
    address text,
    notes text,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT chk_worker_daily_activities_type CHECK (activity_type IN ('OFFICE', 'SUPPLIER', 'SHOP', 'WAREHOUSE', 'BREAK', 'OTHER'))
);

CREATE UNIQUE INDEX uk_worker_daily_activities_open
    ON worker_daily_activities (tenant_id, worker_id)
    WHERE ended_at IS NULL;

CREATE INDEX idx_worker_daily_activities_worker_date
    ON worker_daily_activities (tenant_id, worker_id, activity_date);
