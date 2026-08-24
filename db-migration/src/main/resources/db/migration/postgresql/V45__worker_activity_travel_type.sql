ALTER TABLE worker_daily_activities
    DROP CONSTRAINT IF EXISTS chk_worker_daily_activities_type;

ALTER TABLE worker_daily_activities
    ADD CONSTRAINT chk_worker_daily_activities_type
    CHECK (activity_type IN ('OFFICE', 'SUPPLIER', 'SHOP', 'WAREHOUSE', 'TRAVEL', 'BREAK', 'OTHER'));
