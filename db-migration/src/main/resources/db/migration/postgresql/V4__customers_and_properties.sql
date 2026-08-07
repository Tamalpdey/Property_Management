CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    display_name text NOT NULL,
    email citext,
    phone text,
    billing_email citext,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_customers_tenant_name ON customers (tenant_id, display_name);

CREATE TABLE properties (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    name text NOT NULL,
    address_line1 text NOT NULL,
    address_line2 text,
    city text NOT NULL,
    province_code text,
    postal_code text,
    country_code char(2) NOT NULL DEFAULT 'CA',
    latitude numeric(10, 7),
    longitude numeric(10, 7),
    service_notes text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_properties_tenant_customer ON properties (tenant_id, customer_id);
CREATE INDEX idx_properties_tenant_city ON properties (tenant_id, city);

CREATE TABLE property_access_instructions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    instruction_type text NOT NULL,
    instructions text NOT NULL,
    sensitive boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_property_access_property ON property_access_instructions (tenant_id, property_id);

CREATE TABLE service_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_service_categories_name UNIQUE (tenant_id, name)
);

CREATE TABLE service_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id uuid REFERENCES service_categories(id) ON DELETE SET NULL,
    name text NOT NULL,
    description text,
    default_duration_minutes integer NOT NULL DEFAULT 60,
    base_price numeric(12, 2),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_service_types_name UNIQUE (tenant_id, name)
);
