CREATE INDEX IF NOT EXISTS idx_audit_platform_created
    ON audit_logs (created_at DESC, id DESC)
    WHERE (resource_type = 'TENANT' AND action IN (
        'TENANT_ONBOARDED', 'TENANT_UPDATED', 'TENANT_MODULE_ENABLED', 'TENANT_MODULE_DISABLED'
    )) OR action IN ('SUPERADMIN_USER_ACCESS_UPDATED', 'SUPERADMIN_SUPPORT_NOTE_ADDED');

CREATE INDEX IF NOT EXISTS idx_audit_platform_tenant_created
    ON audit_logs (tenant_id, created_at DESC, id DESC)
    WHERE (resource_type = 'TENANT' AND action IN (
        'TENANT_ONBOARDED', 'TENANT_UPDATED', 'TENANT_MODULE_ENABLED', 'TENANT_MODULE_DISABLED'
    )) OR action IN ('SUPERADMIN_USER_ACCESS_UPDATED', 'SUPERADMIN_SUPPORT_NOTE_ADDED');
