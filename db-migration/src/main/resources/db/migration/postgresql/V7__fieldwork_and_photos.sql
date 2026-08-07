CREATE TABLE work_order_time_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    entry_type text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    start_latitude numeric(10, 7),
    start_longitude numeric(10, 7),
    end_latitude numeric(10, 7),
    end_longitude numeric(10, 7),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_work_order_time_entries_worker ON work_order_time_entries (tenant_id, worker_id, started_at DESC);
CREATE INDEX idx_work_order_time_entries_work_order ON work_order_time_entries (tenant_id, work_order_id);

CREATE TABLE work_order_breaks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    time_entry_id uuid NOT NULL REFERENCES work_order_time_entries(id) ON DELETE CASCADE,
    reason text,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_type text NOT NULL,
    owner_id uuid NOT NULL,
    bucket text NOT NULL,
    object_key text NOT NULL,
    content_type text,
    byte_size bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_documents_object UNIQUE (bucket, object_key)
);

CREATE INDEX idx_documents_owner ON documents (tenant_id, owner_type, owner_id);

CREATE TABLE work_order_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    photo_type text NOT NULL,
    caption text,
    captured_at timestamptz,
    latitude numeric(10, 7),
    longitude numeric(10, 7),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_work_order_photos_work_order ON work_order_photos (tenant_id, work_order_id, photo_type);
