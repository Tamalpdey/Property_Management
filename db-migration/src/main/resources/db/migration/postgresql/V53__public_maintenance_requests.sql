CREATE TABLE public_maintenance_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_code text NOT NULL UNIQUE,
    tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
    tenant_key text,
    source_domain text,
    source_url text,
    name text NOT NULL,
    email text,
    phone text,
    property_address text NOT NULL,
    service_requested text,
    message text NOT NULL,
    status text NOT NULL DEFAULT 'NEW',
    remote_addr text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ck_public_maintenance_requests_status
        CHECK (status IN ('NEW', 'TRIAGED', 'CONVERTED', 'CLOSED'))
);

CREATE INDEX idx_public_maintenance_requests_status_created
    ON public_maintenance_requests (status, created_at DESC);

CREATE INDEX idx_public_maintenance_requests_tenant_key_created
    ON public_maintenance_requests (tenant_key, created_at DESC);

CREATE INDEX idx_public_maintenance_requests_source_domain_created
    ON public_maintenance_requests (source_domain, created_at DESC);
