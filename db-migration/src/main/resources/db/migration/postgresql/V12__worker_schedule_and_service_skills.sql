CREATE TYPE worker_engagement_type AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'SEASONAL');

ALTER TABLE workers
    ADD COLUMN engagement_type worker_engagement_type NOT NULL DEFAULT 'FULL_TIME',
    ADD COLUMN max_weekly_hours integer,
    ADD COLUMN notes text;

CREATE TABLE worker_service_skills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    service_type_id uuid NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    skill_level text NOT NULL DEFAULT 'QUALIFIED',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_worker_service_skill UNIQUE (tenant_id, worker_id, service_type_id)
);

CREATE INDEX idx_worker_service_skills_worker ON worker_service_skills (tenant_id, worker_id);
CREATE INDEX idx_worker_service_skills_service ON worker_service_skills (tenant_id, service_type_id);

CREATE TABLE worker_shift_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
    day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    start_time time NOT NULL,
    end_time time NOT NULL,
    timezone text NOT NULL DEFAULT 'America/Toronto',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT ck_worker_shift_time CHECK (start_time < end_time),
    CONSTRAINT uk_worker_shift_template UNIQUE (tenant_id, worker_id, day_of_week, start_time, end_time)
);

CREATE INDEX idx_worker_shift_templates_worker ON worker_shift_templates (tenant_id, worker_id, active);
