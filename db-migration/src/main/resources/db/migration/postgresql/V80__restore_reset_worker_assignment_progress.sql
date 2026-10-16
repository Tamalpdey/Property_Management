-- Restore only resets proven by an assignment-edit audit and the same worker's execution audit.
-- Explicit overrides and fresh/reassigned workers must not inherit historical progress.
WITH candidates AS (
    SELECT a.id, a.tenant_id, a.work_order_id, a.worker_id, reset.id AS reset_audit_id,
           reset.previous_status
    FROM work_order_assignments a
    JOIN work_orders wo ON wo.id = a.work_order_id AND wo.tenant_id = a.tenant_id
    JOIN LATERAL (
        SELECT log.id, log.created_at,
               (SELECT old_item->>'assignmentStatus'
                FROM jsonb_array_elements(coalesce(log.metadata->'before', '[]'::jsonb)) old_item
                WHERE old_item->>'workerId' = a.worker_id::text LIMIT 1) AS previous_status,
               changed->>'assignmentStatus' AS next_status
        FROM audit_logs log
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(log.metadata->'after', '[]'::jsonb)) changed
        WHERE log.tenant_id = a.tenant_id AND log.resource_type = 'WORK_ORDER'
          AND log.resource_id = a.work_order_id AND log.action = 'WORK_ORDER_ASSIGNMENTS_UPDATED'
          AND changed->>'workerId' = a.worker_id::text
          AND (SELECT old_item->>'assignmentStatus'
               FROM jsonb_array_elements(coalesce(log.metadata->'before', '[]'::jsonb)) old_item
               WHERE old_item->>'workerId' = a.worker_id::text LIMIT 1)
              IS DISTINCT FROM changed->>'assignmentStatus'
        ORDER BY log.created_at DESC, log.id DESC LIMIT 1
    ) reset ON reset.next_status = 'ASSIGNED'
    JOIN LATERAL (
        SELECT CASE event.action
                   WHEN 'WORKER_START_TRAVEL' THEN 'ACCEPTED'
                   WHEN 'WORKER_ARRIVE_ON_SITE' THEN 'ON_SITE'
                   WHEN 'WORKER_START_WORK' THEN 'IN_PROGRESS'
                   WHEN 'WORKER_RESUME_WORK' THEN 'IN_PROGRESS'
                   WHEN 'WORKER_PAUSE_WORK' THEN 'PAUSED'
                   WHEN 'WORKER_COMPLETE_WORK' THEN 'COMPLETED'
               END AS status
        FROM audit_logs event
        WHERE event.tenant_id = a.tenant_id AND event.resource_type = 'WORK_ORDER'
          AND event.resource_id = a.work_order_id AND event.metadata->>'workerId' = a.worker_id::text
          AND event.created_at <= reset.created_at
          AND event.action IN ('WORKER_START_TRAVEL', 'WORKER_ARRIVE_ON_SITE', 'WORKER_START_WORK',
                               'WORKER_RESUME_WORK', 'WORKER_PAUSE_WORK', 'WORKER_COMPLETE_WORK')
        ORDER BY event.created_at DESC, event.id DESC LIMIT 1
    ) progress ON progress.status = reset.previous_status
    WHERE a.assignment_status = 'ASSIGNED'
      AND reset.previous_status IN ('ACCEPTED', 'ON_SITE', 'IN_PROGRESS', 'PAUSED', 'COMPLETED')
      AND wo.status NOT IN ('CANCELLED', 'APPROVED', 'CUSTOMER_NOTIFIED', 'INVOICED', 'PAID')
      AND NOT EXISTS (
          SELECT 1 FROM audit_logs override_log
          WHERE override_log.tenant_id = a.tenant_id AND override_log.resource_type = 'WORK_ORDER'
            AND override_log.resource_id = a.work_order_id AND override_log.created_at > reset.created_at
            AND override_log.action IN ('WORK_ORDER_FIELD_OVERRIDE_APPLIED', 'WORK_ORDER_REJECTED', 'WORK_ORDER_OVERRIDE_COMPLETED')
      )
      AND (reset.previous_status <> 'COMPLETED' OR NOT EXISTS (
          SELECT 1 FROM work_order_time_entries time_entry
          WHERE time_entry.tenant_id = a.tenant_id AND time_entry.work_order_id = a.work_order_id
            AND time_entry.worker_id = a.worker_id AND time_entry.ended_at IS NULL
      ))
), restored AS (
    UPDATE work_order_assignments a
    SET assignment_status = candidates.previous_status::work_order_assignment_status, updated_at = now()
    FROM candidates WHERE a.id = candidates.id
    RETURNING a.tenant_id, a.work_order_id, a.worker_id, a.assignment_status, candidates.reset_audit_id
)
INSERT INTO audit_logs(tenant_id, action, resource_type, resource_id, metadata)
SELECT tenant_id, 'WORKER_ASSIGNMENT_PROGRESS_RESTORED', 'WORK_ORDER', work_order_id,
       jsonb_build_object('workerId', worker_id, 'previousStatus', 'ASSIGNED', 'assignmentStatus', assignment_status,
                          'resetAuditId', reset_audit_id, 'source', 'MIGRATION_V80')
FROM restored;

UPDATE work_orders wo SET status = 'PENDING_COMPLETION', updated_at = now()
WHERE wo.status IN ('ASSIGNED', 'TRAVELING', 'ON_SITE', 'IN_PROGRESS', 'PAUSED')
  AND EXISTS (SELECT 1 FROM audit_logs log WHERE log.tenant_id = wo.tenant_id
      AND log.resource_id = wo.id AND log.action = 'WORKER_ASSIGNMENT_PROGRESS_RESTORED'
      AND log.metadata->>'assignmentStatus' = 'COMPLETED')
  AND NOT EXISTS (SELECT 1 FROM work_order_assignments a WHERE a.tenant_id = wo.tenant_id
      AND a.work_order_id = wo.id AND a.assignment_status NOT IN ('COMPLETED', 'RELEASED', 'DECLINED', 'LEFT_EMERGENCY'));
