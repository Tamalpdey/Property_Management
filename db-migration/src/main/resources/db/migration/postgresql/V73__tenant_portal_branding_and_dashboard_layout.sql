ALTER TABLE tenant_settings
    ADD COLUMN IF NOT EXISTS theme_navigation_color varchar(7) NOT NULL DEFAULT '#0f172a',
    ADD COLUMN IF NOT EXISTS theme_surface_color varchar(7) NOT NULL DEFAULT '#ffffff',
    ADD COLUMN IF NOT EXISTS theme_page_background_color varchar(7) NOT NULL DEFAULT '#f4f7fb',
    ADD COLUMN IF NOT EXISTS theme_density varchar(16) NOT NULL DEFAULT 'COMFORTABLE',
    ADD COLUMN IF NOT EXISTS theme_radius varchar(16) NOT NULL DEFAULT 'SMALL',
    ADD COLUMN IF NOT EXISTS dashboard_widget_order text NOT NULL DEFAULT 'metrics,actionQueue,clockedIn,workMix,topServices,finance,workerLoad,inventoryRisk',
    ADD COLUMN IF NOT EXISTS dashboard_hidden_widgets text NOT NULL DEFAULT '';

ALTER TABLE tenant_settings
    DROP CONSTRAINT IF EXISTS ck_tenant_settings_theme_density,
    DROP CONSTRAINT IF EXISTS ck_tenant_settings_theme_radius;


ALTER TABLE tenant_settings
    ADD CONSTRAINT ck_tenant_settings_theme_density
        CHECK (theme_density IN ('COMPACT', 'COMFORTABLE', 'SPACIOUS')),
    ADD CONSTRAINT ck_tenant_settings_theme_radius
        CHECK (theme_radius IN ('SHARP', 'SMALL', 'ROUNDED'));
