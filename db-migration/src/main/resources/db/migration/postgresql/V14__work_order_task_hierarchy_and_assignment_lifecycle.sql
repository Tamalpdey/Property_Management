CREATE TYPE work_order_assignment_status AS ENUM (
    'ASSIGNED',
    'ACCEPTED',
    'DECLINED',
    'IN_PROGRESS',
    'PAUSED',
    'LEFT_EMERGENCY',
    'COMPLETED',
    'RELEASED'
);

CREATE TYPE work_order_task_status AS ENUM (
    'TO_DO',
    'IN_PROGRESS',
    'ON_HOLD',
    'PENDING_COMPLETION',
    'COMPLETED',
    'CANCELLED'
);

ALTER TABLE work_order_assignments
    ADD COLUMN assignment_status work_order_assignment_status NOT NULL DEFAULT 'ASSIGNED',
    ADD COLUMN assignment_role text,
    ADD COLUMN notes text,
    ADD COLUMN released_at timestamptz,
    ADD COLUMN release_reason text;

CREATE INDEX idx_work_order_assignments_status ON work_order_assignments (tenant_id, assignment_status);

ALTER TABLE work_order_tasks
    ADD COLUMN parent_task_id uuid REFERENCES work_order_tasks(id) ON DELETE CASCADE,
    ADD COLUMN assigned_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
    ADD COLUMN task_status work_order_task_status NOT NULL DEFAULT 'TO_DO',
    ADD COLUMN notes text;

UPDATE work_order_tasks
SET task_status = CASE WHEN completed THEN 'COMPLETED'::work_order_task_status ELSE 'TO_DO'::work_order_task_status END;

CREATE INDEX idx_work_order_tasks_parent ON work_order_tasks (tenant_id, parent_task_id);
CREATE INDEX idx_work_order_tasks_assignee ON work_order_tasks (tenant_id, assigned_worker_id, task_status);
