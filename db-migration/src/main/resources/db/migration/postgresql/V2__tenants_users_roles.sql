CREATE TABLE tenants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name text NOT NULL,
    display_name text NOT NULL,
    status tenant_status NOT NULL DEFAULT 'TRIAL',
    plan_code text NOT NULL DEFAULT 'starter',
    timezone text NOT NULL DEFAULT 'America/Toronto',
    country_code char(2) NOT NULL DEFAULT 'CA',
    province_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE app_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email citext NOT NULL,
    display_name text NOT NULL,
    phone text,
    password_hash text,
    status user_status NOT NULL DEFAULT 'INVITED',
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    CONSTRAINT uk_app_users_email UNIQUE (email)
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    display_name text NOT NULL,
    platform_role boolean NOT NULL DEFAULT false
);

CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    display_name text NOT NULL
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_tenant_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid,
    CONSTRAINT uk_user_tenant_role UNIQUE (tenant_id, user_id, role_id)
);

CREATE INDEX idx_user_tenant_roles_tenant ON user_tenant_roles (tenant_id);
CREATE INDEX idx_user_tenant_roles_user ON user_tenant_roles (user_id);

INSERT INTO roles (code, display_name, platform_role) VALUES
    ('SUPER_ADMIN', 'Super Administrator', true),
    ('TENANT_ADMIN', 'Tenant Administrator', false),
    ('OPERATIONS', 'Operations', false),
    ('FINANCE', 'Finance', false),
    ('FIELD_WORKER', 'Field Worker', false),
    ('CUSTOMER', 'Customer', false);

INSERT INTO permissions (code, display_name) VALUES
    ('MANAGE_TENANTS', 'Manage tenants'),
    ('MANAGE_PROPERTIES', 'Manage properties'),
    ('MANAGE_WORKERS', 'Manage workers'),
    ('CREATE_WORK_ORDERS', 'Create work orders'),
    ('ASSIGN_WORKERS', 'Assign workers'),
    ('APPROVE_WORK', 'Approve completed work'),
    ('FIELD_WORK', 'Execute field work'),
    ('VIEW_FINANCE', 'View finance'),
    ('MANAGE_PAYROLL', 'Manage payroll'),
    ('UPLOAD_JOB_PHOTOS', 'Upload job photos'),
    ('VIEW_CUSTOMER_PORTAL', 'View customer portal');
