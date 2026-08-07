CREATE TABLE inventory_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_inventory_categories_name UNIQUE (tenant_id, name)
);

CREATE TABLE inventory_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id uuid REFERENCES inventory_categories(id) ON DELETE SET NULL,
    name text NOT NULL,
    unit text NOT NULL,
    quantity_on_hand numeric(12, 2) NOT NULL DEFAULT 0,
    reorder_level numeric(12, 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_inventory_items_tenant_name ON inventory_items (tenant_id, name);

CREATE TABLE work_order_materials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    inventory_item_id uuid REFERENCES inventory_items(id) ON DELETE SET NULL,
    description text NOT NULL,
    quantity numeric(12, 2) NOT NULL,
    unit_cost numeric(12, 2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    asset_type text NOT NULL,
    name text NOT NULL,
    identifier text,
    assigned_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_assets_tenant_type ON assets (tenant_id, asset_type);

CREATE TABLE invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
    invoice_number text NOT NULL,
    status invoice_status NOT NULL DEFAULT 'DRAFT',
    issued_on date,
    due_on date,
    subtotal numeric(12, 2) NOT NULL DEFAULT 0,
    tax_total numeric(12, 2) NOT NULL DEFAULT 0,
    total numeric(12, 2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_invoices_number UNIQUE (tenant_id, invoice_number)
);

CREATE INDEX idx_invoices_tenant_status ON invoices (tenant_id, status);

CREATE TABLE invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description text NOT NULL,
    quantity numeric(12, 2) NOT NULL DEFAULT 1,
    unit_price numeric(12, 2) NOT NULL DEFAULT 0,
    line_total numeric(12, 2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    status payment_status NOT NULL DEFAULT 'PENDING',
    amount numeric(12, 2) NOT NULL,
    paid_at timestamptz,
    reference text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE INDEX idx_payments_invoice ON payments (tenant_id, invoice_id);

CREATE TABLE payroll_periods (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status payroll_status NOT NULL DEFAULT 'OPEN',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_payroll_period UNIQUE (tenant_id, period_start, period_end)
);

CREATE TABLE payroll_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    payroll_period_id uuid NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,
    regular_minutes integer NOT NULL DEFAULT 0,
    travel_minutes integer NOT NULL DEFAULT 0,
    break_minutes integer NOT NULL DEFAULT 0,
    gross_pay numeric(12, 2) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_payroll_record_worker UNIQUE (tenant_id, payroll_period_id, worker_id)
);
