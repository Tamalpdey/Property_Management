CREATE TABLE workers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
    employee_number text,
    display_name text NOT NULL,
    phone text,
    email citext,
    status worker_status NOT NULL DEFAULT 'ACTIVE',
    hourly_rate numeric(12, 2),
    hire_date date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_workers_employee_number UNIQUE (tenant_id, employee_number)
);

CREATE INDEX idx_workers_tenant_status ON workers (tenant_id, status);

CREATE TABLE worker_emergency_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    contact_name text NOT NULL,
    relationship text,
    phone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE worker_certifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    certification_name text NOT NULL,
    issued_by text,
    issued_on date,
    expires_on date,
    document_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_worker_certifications_expiry ON worker_certifications (tenant_id, expires_on);
