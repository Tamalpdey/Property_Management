CREATE UNIQUE INDEX IF NOT EXISTS uk_properties_tenant_id_id ON properties (tenant_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uk_service_types_tenant_id_id ON service_types (tenant_id, id);

CREATE TABLE property_service_types (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id uuid NOT NULL,
    service_type_id uuid NOT NULL,
    notes text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT fk_property_service_types_property
        FOREIGN KEY (tenant_id, property_id)
        REFERENCES properties(tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT fk_property_service_types_service_type
        FOREIGN KEY (tenant_id, service_type_id)
        REFERENCES service_types(tenant_id, id)
        ON DELETE RESTRICT,
    CONSTRAINT uk_property_service_types_property_service UNIQUE (tenant_id, property_id, service_type_id)
);

CREATE INDEX idx_property_service_types_property ON property_service_types (tenant_id, property_id);
CREATE INDEX idx_property_service_types_service_type ON property_service_types (tenant_id, service_type_id);
