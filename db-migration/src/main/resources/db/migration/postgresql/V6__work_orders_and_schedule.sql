CREATE TABLE work_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    service_type_id uuid REFERENCES service_types(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    status work_order_status NOT NULL DEFAULT 'CREATED',
    priority work_order_priority NOT NULL DEFAULT 'NORMAL',
    scheduled_start timestamptz,
    scheduled_end timestamptz,
    approved_at timestamptz,
    approved_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_work_orders_tenant_status ON work_orders (tenant_id, status);
CREATE INDEX idx_work_orders_tenant_schedule ON work_orders (tenant_id, scheduled_start);
CREATE INDEX idx_work_orders_property ON work_orders (tenant_id, property_id);

CREATE TABLE work_order_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    label text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    required boolean NOT NULL DEFAULT true,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    completed_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_work_order_tasks_work_order ON work_order_tasks (tenant_id, work_order_id, sort_order);

CREATE TABLE work_order_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    lead_worker boolean NOT NULL DEFAULT false,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_work_order_worker UNIQUE (tenant_id, work_order_id, worker_id)
);

CREATE INDEX idx_work_order_assignments_worker ON work_order_assignments (tenant_id, worker_id);
