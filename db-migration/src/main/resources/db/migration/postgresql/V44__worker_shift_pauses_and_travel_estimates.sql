CREATE TABLE worker_shift_clock_pauses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    shift_clock_entry_id uuid NOT NULL REFERENCES worker_shift_clock_entries(id) ON DELETE CASCADE,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    start_latitude numeric(10, 7),
    start_longitude numeric(10, 7),
    start_accuracy_meters numeric(12, 2),
    end_latitude numeric(10, 7),
    end_longitude numeric(10, 7),
    end_accuracy_meters numeric(12, 2),
    device_started_at timestamptz,
    device_ended_at timestamptz,
    start_platform text,
    end_platform text,
    start_user_agent text,
    end_user_agent text,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uk_worker_shift_clock_pauses_open
    ON worker_shift_clock_pauses (tenant_id, worker_id, shift_clock_entry_id)
    WHERE ended_at IS NULL;

CREATE INDEX idx_worker_shift_clock_pauses_entry
    ON worker_shift_clock_pauses (tenant_id, worker_id, shift_clock_entry_id, started_at);

ALTER TABLE work_order_assignments
    ADD COLUMN estimated_travel_minutes integer,
    ADD COLUMN estimated_travel_distance_meters integer,
    ADD COLUMN travel_estimate_provider text,
    ADD COLUMN travel_estimated_at timestamptz;

ALTER TABLE work_order_route_stops
    ADD COLUMN estimated_travel_minutes integer,
    ADD COLUMN estimated_travel_distance_meters integer,
    ADD COLUMN travel_estimate_provider text,
    ADD COLUMN travel_estimated_at timestamptz;
