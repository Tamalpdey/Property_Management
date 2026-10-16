-- Run after V78. This script defaults to ROLLBACK; review its output before changing that to COMMIT.
-- Set these session values first using SELECT set_config('lorne.repair.<key>', '<value>', false):
-- work_order_id, worker_email, retained_employee_number, duplicate_employee_number, actor_user_id.
-- PT012 and PT0012 identify the same employee-number spelling with padded zeroes.
BEGIN;

DO $$
DECLARE
    job_id uuid := nullif(current_setting('lorne.repair.work_order_id', true), '')::uuid;
    email_address text := lower(btrim(current_setting('lorne.repair.worker_email', true)));
    retained_code text := upper(btrim(current_setting('lorne.repair.retained_employee_number', true)));
    duplicate_code text := upper(btrim(current_setting('lorne.repair.duplicate_employee_number', true)));
    actor_id uuid := nullif(current_setting('lorne.repair.actor_user_id', true), '')::uuid;
    company_id uuid;
    service_id uuid;
    retained_id uuid;
    duplicate_id uuid;
    retained_user_id uuid;
    assignment_id uuid;
    previous_lead boolean;
    target_count integer;
    source_count integer;
BEGIN
    IF job_id IS NULL OR actor_id IS NULL OR email_address IS NULL OR email_address = ''
       OR retained_code IS NULL OR duplicate_code IS NULL THEN
        RAISE EXCEPTION 'All five lorne.repair settings are required. No changes made.';
    END IF;
    SELECT tenant_id, service_type_id INTO STRICT company_id, service_id FROM work_orders WHERE id = job_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM user_tenant_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = actor_id AND (ur.tenant_id = company_id AND r.code = 'TENANT_ADMIN'
           OR ur.tenant_id IS NULL AND r.code = 'SUPER_ADMIN')
    ) THEN
        RAISE EXCEPTION 'Repair actor must be a tenant administrator or superadmin.';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(company_id::text || ':' || email_address, 0));
    PERFORM id FROM workers WHERE tenant_id = company_id AND lower(btrim(email::text)) = email_address ORDER BY id FOR UPDATE;
    SELECT count(*) INTO target_count FROM workers
    WHERE tenant_id = company_id AND lower(btrim(email::text)) = email_address
      AND regexp_replace(upper(btrim(employee_number)), '(^[A-Z]+)0+([0-9]+)$', '\1\2')
          = regexp_replace(retained_code, '(^[A-Z]+)0+([0-9]+)$', '\1\2');
    SELECT count(*) INTO source_count FROM workers
    WHERE tenant_id = company_id AND lower(btrim(email::text)) = email_address
      AND regexp_replace(upper(btrim(employee_number)), '(^[A-Z]+)0+([0-9]+)$', '\1\2')
          = regexp_replace(duplicate_code, '(^[A-Z]+)0+([0-9]+)$', '\1\2');
    IF target_count <> 1 OR source_count <> 1 THEN
        RAISE EXCEPTION 'Expected exactly one retained profile and one duplicate profile in this tenant.';
    END IF;
    SELECT id, user_id INTO retained_id, retained_user_id FROM workers
    WHERE tenant_id = company_id AND lower(btrim(email::text)) = email_address
      AND regexp_replace(upper(btrim(employee_number)), '(^[A-Z]+)0+([0-9]+)$', '\1\2')
          = regexp_replace(retained_code, '(^[A-Z]+)0+([0-9]+)$', '\1\2') AND status = 'ACTIVE';
    SELECT id INTO duplicate_id FROM workers
    WHERE tenant_id = company_id AND lower(btrim(email::text)) = email_address
      AND regexp_replace(upper(btrim(employee_number)), '(^[A-Z]+)0+([0-9]+)$', '\1\2')
          = regexp_replace(duplicate_code, '(^[A-Z]+)0+([0-9]+)$', '\1\2') AND status = 'INACTIVE' AND user_id IS NULL;
    IF retained_id IS NULL OR retained_user_id IS NULL OR duplicate_id IS NULL OR retained_id = duplicate_id THEN
        RAISE EXCEPTION 'Retained profile must be ACTIVE with a login; duplicate must be INACTIVE without a login.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM app_users WHERE id = retained_user_id AND status = 'ACTIVE' AND lower(email::text) = email_address)
       OR NOT EXISTS (SELECT 1 FROM user_tenant_roles ur JOIN roles r ON r.id = ur.role_id
                      WHERE ur.tenant_id = company_id AND ur.user_id = retained_user_id AND r.code = 'FIELD_WORKER') THEN
        RAISE EXCEPTION 'Retained login must be active, have the same email and Field Worker access for this tenant.';
    END IF;
    IF service_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM worker_service_skills WHERE tenant_id = company_id AND worker_id = retained_id AND service_type_id = service_id
    ) THEN
        RAISE EXCEPTION 'Retained worker must be qualified for the service before repairing the assignment.';
    END IF;
    IF EXISTS (SELECT 1 FROM work_orders WHERE id = job_id AND status IN ('COMPLETED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID', 'CANCELLED')) THEN
        RAISE EXCEPTION 'Completed or billed work must not be changed by this repair.';
    END IF;
    PERFORM id FROM work_order_assignments WHERE tenant_id = company_id AND work_order_id = job_id ORDER BY worker_id FOR UPDATE;
    SELECT id, lead_worker INTO assignment_id, previous_lead FROM work_order_assignments
    WHERE tenant_id = company_id AND work_order_id = job_id AND worker_id = duplicate_id
      AND assignment_status IN ('ASSIGNED', 'ACCEPTED');
    IF assignment_id IS NULL THEN
        RAISE EXCEPTION 'Duplicate has no pending assignment on this work order. In-progress or completed assignments require manual review.';
    END IF;
    IF EXISTS (SELECT 1 FROM work_order_time_entries WHERE tenant_id = company_id AND worker_id = duplicate_id AND ended_at IS NULL)
       OR EXISTS (SELECT 1 FROM worker_shift_clock_entries WHERE tenant_id = company_id AND worker_id = duplicate_id AND ended_at IS NULL)
       OR EXISTS (SELECT 1 FROM work_order_assignments WHERE tenant_id = company_id AND work_order_id = job_id
                      AND worker_id = retained_id AND assignment_status IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY')) THEN
        RAISE EXCEPTION 'Open time records or a closed retained-worker assignment require manual review.';
    END IF;
    INSERT INTO work_order_assignments(tenant_id, work_order_id, worker_id, lead_worker, assignment_status, created_by, updated_by)
    VALUES (company_id, job_id, retained_id, previous_lead, 'ASSIGNED', actor_id, actor_id)
    ON CONFLICT (tenant_id, work_order_id, worker_id) DO UPDATE
        SET lead_worker = work_order_assignments.lead_worker OR excluded.lead_worker, updated_at = now(), updated_by = actor_id;
    UPDATE work_order_assignments SET assignment_status = 'RELEASED', lead_worker = false,
        released_at = now(), release_reason = 'Duplicate worker profile corrected; retained employee ' || retained_code,
        updated_by = actor_id, updated_at = now() WHERE id = assignment_id;
    UPDATE work_order_tasks SET assigned_worker_id = retained_id, updated_by = actor_id, updated_at = now()
    WHERE tenant_id = company_id AND work_order_id = job_id AND assigned_worker_id = duplicate_id
      AND task_status NOT IN ('COMPLETED', 'CANCELLED');
    -- Keep the old profile and historical records. Record its former email before clearing the duplicate contact key.
    UPDATE workers SET email = NULL, updated_by = actor_id, updated_at = now() WHERE tenant_id = company_id AND id = duplicate_id;
    INSERT INTO audit_logs(tenant_id, actor_user_id, action, resource_type, resource_id, metadata)
    VALUES (company_id, actor_id, 'WORKER_DUPLICATE_ASSIGNMENT_REPAIRED', 'WORK_ORDER', job_id,
        jsonb_build_object('retainedWorkerId', retained_id, 'retainedEmployeeNumber', retained_code,
                          'duplicateWorkerId', duplicate_id, 'duplicateEmployeeNumber', duplicate_code,
                          'duplicatePreviousEmail', email_address, 'historicalRecordsPreserved', true));
    RAISE NOTICE 'Retained worker %, released duplicate worker % for work order %. Review results before COMMIT.', retained_id, duplicate_id, job_id;
END;
$$;

SELECT w.id, w.employee_number, w.status, w.email, w.user_id, wa.assignment_status, wa.lead_worker
FROM work_order_assignments wa JOIN workers w ON w.id = wa.worker_id AND w.tenant_id = wa.tenant_id
WHERE wa.work_order_id = current_setting('lorne.repair.work_order_id')::uuid ORDER BY w.employee_number;

ROLLBACK;
