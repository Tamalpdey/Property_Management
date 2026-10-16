CREATE TABLE quote_templates (
    code text PRIMARY KEY CHECK (code IN ('ITEMIZED', 'TOTAL_PRICE')),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
    pricing_mode text NOT NULL CHECK (pricing_mode IN ('ITEMIZED', 'TOTAL_PRICE')),
    default_notes text,
    default_terms text,
    version integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL
);
INSERT INTO quote_templates(code,name,pricing_mode,default_terms) VALUES
    ('ITEMIZED','Itemized quote','ITEMIZED','Pricing is valid until the date shown above.'),
    ('TOTAL_PRICE','Total price quote','TOTAL_PRICE','Pricing is valid until the date shown above.');

CREATE TABLE tenant_quote_templates (
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_code text NOT NULL REFERENCES quote_templates(code) ON DELETE RESTRICT,
    is_default boolean NOT NULL DEFAULT false,
    PRIMARY KEY (tenant_id,template_code)
);
CREATE UNIQUE INDEX idx_tenant_quote_template_default ON tenant_quote_templates(tenant_id) WHERE is_default;
INSERT INTO tenant_quote_templates(tenant_id,template_code,is_default) SELECT id,'ITEMIZED',true FROM tenants;

CREATE FUNCTION assign_initial_quote_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO tenant_quote_templates(tenant_id,template_code,is_default) VALUES (NEW.id,'ITEMIZED',true);
    RETURN NEW;
END;
$$;
CREATE TRIGGER tenants_initial_quote_template AFTER INSERT ON tenants
    FOR EACH ROW EXECUTE FUNCTION assign_initial_quote_template();

ALTER TABLE quotes
    ADD COLUMN template_code text NOT NULL DEFAULT 'ITEMIZED' REFERENCES quote_templates(code),
    ADD COLUMN template_name text NOT NULL DEFAULT 'Itemized quote',
    ADD COLUMN pricing_mode text NOT NULL DEFAULT 'ITEMIZED' CHECK (pricing_mode IN ('ITEMIZED','TOTAL_PRICE'));
