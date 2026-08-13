CREATE TABLE worker_daily_loadouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    loadout_date date NOT NULL,
    status text NOT NULL DEFAULT 'PLANNED',
    checked_out_at timestamptz,
    returned_at timestamptz,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_worker_daily_loadouts_worker_date UNIQUE (tenant_id, worker_id, loadout_date),
    CONSTRAINT chk_worker_daily_loadouts_status CHECK (status IN ('PLANNED', 'PARTIAL', 'CHECKED_OUT', 'RETURNED', 'ISSUE_REPORTED'))
);

CREATE TABLE worker_daily_loadout_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    loadout_id uuid NOT NULL REFERENCES worker_daily_loadouts(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'PLANNED',
    checked_out_at timestamptz,
    returned_at timestamptz,
    issue_note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_worker_daily_loadout_items_asset UNIQUE (tenant_id, loadout_id, work_order_id, asset_id),
    CONSTRAINT chk_worker_daily_loadout_items_status CHECK (status IN ('PLANNED', 'CHECKED_OUT', 'RETURNED', 'DAMAGED', 'MISSING'))
);

CREATE INDEX idx_worker_daily_loadouts_worker_date ON worker_daily_loadouts (tenant_id, worker_id, loadout_date);
CREATE INDEX idx_worker_daily_loadout_items_loadout ON worker_daily_loadout_items (tenant_id, loadout_id);
CREATE INDEX idx_worker_daily_loadout_items_work_order ON worker_daily_loadout_items (tenant_id, work_order_id);
