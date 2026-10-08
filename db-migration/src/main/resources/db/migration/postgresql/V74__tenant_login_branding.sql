ALTER TABLE tenants
    ADD COLUMN IF NOT EXISTS portal_subdomain text;

UPDATE tenants
SET portal_subdomain = left(coalesce(nullif(trim(both '-' from regexp_replace(lower(display_name), '[^a-z0-9]+', '-', 'g')), ''), 'tenant'), 33)
    || '-' || left(id::text, 6)
WHERE portal_subdomain IS NULL OR btrim(portal_subdomain) = '';

ALTER TABLE tenants
    ALTER COLUMN portal_subdomain SET DEFAULT ('tenant-' || left(replace(gen_random_uuid()::text, '-', ''), 12)),
    ALTER COLUMN portal_subdomain SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uk_tenants_portal_subdomain
    ON tenants (lower(portal_subdomain));

ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS login_style varchar(16) NOT NULL DEFAULT 'SPLIT',
    ADD COLUMN IF NOT EXISTS login_headline varchar(120) NOT NULL DEFAULT 'Welcome back',
    ADD COLUMN IF NOT EXISTS login_message varchar(300) NOT NULL DEFAULT 'Access your operations workspace.',
    ADD COLUMN IF NOT EXISTS login_background_pattern varchar(16) NOT NULL DEFAULT 'GRID',
    ADD COLUMN IF NOT EXISTS login_show_preview boolean NOT NULL DEFAULT true;

ALTER TABLE tenant_settings
    DROP CONSTRAINT IF EXISTS ck_tenant_settings_login_style,
    DROP CONSTRAINT IF EXISTS ck_tenant_settings_login_background_pattern;

ALTER TABLE tenant_settings
    ADD CONSTRAINT ck_tenant_settings_login_style CHECK (login_style IN ('SPLIT', 'FOCUSED', 'MINIMAL')),
    ADD CONSTRAINT ck_tenant_settings_login_background_pattern CHECK (login_background_pattern IN ('GRID', 'SUBTLE', 'NONE'));
