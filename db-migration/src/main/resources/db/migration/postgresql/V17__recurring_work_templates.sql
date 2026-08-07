CREATE TABLE recurring_work_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
    service_type_id uuid REFERENCES service_types(id) ON DELETE SET NULL,
    title text NOT NULL,
    description text,
    priority work_order_priority NOT NULL DEFAULT 'NORMAL',
    recurrence_rule text NOT NULL,
    recurrence_interval integer NOT NULL DEFAULT 1,
    start_date date NOT NULL,
    end_date date,
    preferred_start_time time,
    duration_minutes integer NOT NULL DEFAULT 60,
    generate_days_ahead integer NOT NULL DEFAULT 7,
    active boolean NOT NULL DEFAULT true,
    last_generated_for date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

ALTER TABLE work_orders
    ADD COLUMN recurring_template_id uuid REFERENCES recurring_work_templates(id) ON DELETE SET NULL,
    ADD COLUMN recurrence_occurrence_date date;

CREATE UNIQUE INDEX uk_work_orders_recurring_occurrence
    ON work_orders (tenant_id, recurring_template_id, recurrence_occurrence_date)
    WHERE recurring_template_id IS NOT NULL AND recurrence_occurrence_date IS NOT NULL;

CREATE INDEX idx_recurring_work_templates_tenant_active
    ON recurring_work_templates (tenant_id, active, start_date);
