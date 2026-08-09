ALTER TABLE workers
    ADD COLUMN leave_start_date date,
    ADD COLUMN leave_end_date date,
    ADD COLUMN leave_reason text;

CREATE INDEX idx_workers_tenant_leave_dates
    ON workers (tenant_id, leave_start_date, leave_end_date)
    WHERE status = 'ON_LEAVE';
