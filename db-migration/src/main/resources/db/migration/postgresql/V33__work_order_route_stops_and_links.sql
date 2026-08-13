CREATE TABLE work_order_route_stops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    stop_order integer NOT NULL,
    stop_type text NOT NULL DEFAULT 'PICKUP',
    name text NOT NULL,
    address text,
    instructions text,
    planned_arrival timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT ck_work_order_route_stops_type CHECK (stop_type IN ('PICKUP', 'KEYS', 'SUPPLIER', 'WAREHOUSE', 'OWNER', 'OTHER'))
);

CREATE INDEX idx_work_order_route_stops_work_order ON work_order_route_stops (tenant_id, work_order_id, stop_order);

CREATE TABLE work_order_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    linked_work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    link_type text NOT NULL DEFAULT 'RELATED',
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT ck_work_order_links_type CHECK (link_type IN ('RELATED', 'BLOCKS', 'FOLLOWS', 'SAME_RECURRENCE', 'PICKUP_FOR')),
    CONSTRAINT ck_work_order_links_not_self CHECK (work_order_id <> linked_work_order_id),
    CONSTRAINT uk_work_order_links UNIQUE (tenant_id, work_order_id, linked_work_order_id, link_type)
);

CREATE INDEX idx_work_order_links_work_order ON work_order_links (tenant_id, work_order_id);
CREATE INDEX idx_work_order_links_linked ON work_order_links (tenant_id, linked_work_order_id);

