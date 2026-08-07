CREATE TYPE work_order_task_phase AS ENUM (
    'PRE_START',
    'COMPLETION'
);

ALTER TABLE work_order_tasks
    ADD COLUMN checklist_phase work_order_task_phase NOT NULL DEFAULT 'COMPLETION';

CREATE INDEX idx_work_order_tasks_phase ON work_order_tasks (tenant_id, work_order_id, checklist_phase, sort_order);
