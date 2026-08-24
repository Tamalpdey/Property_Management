package com.lorne.platform.auth.internal.bootstrap;

import java.util.List;
import java.util.UUID;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@ConditionalOnProperty(name = "lorne.bootstrap.enabled", havingValue = "true")
class LocalAuthDataBootstrap implements ApplicationRunner {
    private static final UUID DEMO_TENANT_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID SUPER_ADMIN_ID = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID WORKER_USER_ID = UUID.fromString("20000000-0000-0000-0000-000000000002");
    private static final UUID TENANT_ADMIN_ID = UUID.fromString("20000000-0000-0000-0000-000000000003");
    private static final UUID OWNER_PATEL_ID = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID OWNER_MARTIN_ID = UUID.fromString("30000000-0000-0000-0000-000000000002");
    private static final UUID PROPERTY_OAKRIDGE_ID = UUID.fromString("40000000-0000-0000-0000-000000000001");
    private static final UUID PROPERTY_BAYVIEW_ID = UUID.fromString("40000000-0000-0000-0000-000000000002");
    private static final UUID CATEGORY_PLUMBING_ID = UUID.fromString("50000000-0000-0000-0000-000000000001");
    private static final UUID CATEGORY_POOL_ID = UUID.fromString("50000000-0000-0000-0000-000000000002");
    private static final UUID CATEGORY_LANDSCAPE_ID = UUID.fromString("50000000-0000-0000-0000-000000000003");

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private UUID superAdminUserId = SUPER_ADMIN_ID;
    private UUID workerUserId = WORKER_USER_ID;
    private UUID tenantAdminUserId = TENANT_ADMIN_ID;

    LocalAuthDataBootstrap(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        seedTenant();
        seedUsers();
        seedUserRoles();
        seedPropertyManagementData();
        seedWorkerProfile();
    }

    private void seedTenant() {
        jdbcTemplate.update("""
                INSERT INTO tenants (id, legal_name, display_name, status, plan_code, timezone, country_code, province_code)
                VALUES (?, 'Lorne Demo Property Services Inc.', 'Lorne Demo', 'ACTIVE', 'platform-demo', 'America/Toronto', 'CA', 'ON')
                ON CONFLICT (id) DO NOTHING
                """, DEMO_TENANT_ID);
    }

    private void seedUsers() {
        superAdminUserId = seedUser(SUPER_ADMIN_ID, "superadmin@lorne.local", "Super Admin");
        workerUserId = seedUser(WORKER_USER_ID, "worker@lorne.local", "Field Worker");
        tenantAdminUserId = seedUser(TENANT_ADMIN_ID, "tenantadmin@lorne.local", "Tenant Admin");
    }

    private UUID seedUser(UUID preferredUserId, String email, String displayName) {
        UUID userId = resolveBootstrapUserId(preferredUserId, email);
        jdbcTemplate.update("""
                INSERT INTO app_users (id, email, display_name, password_hash, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'ACTIVE', now(), now())
                ON CONFLICT (email) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    password_hash = EXCLUDED.password_hash,
                    status = 'ACTIVE',
                    updated_at = now()
                """, userId, email, displayName, passwordEncoder.encode("Password123!"));
        return userId;
    }

    private UUID resolveBootstrapUserId(UUID preferredUserId, String email) {
        List<UUID> existingEmailIds = jdbcTemplate.query("""
                SELECT id
                FROM app_users
                WHERE lower(email) = lower(?)
                LIMIT 1
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), email);
        if (!existingEmailIds.isEmpty()) {
            return existingEmailIds.getFirst();
        }

        Boolean preferredIdTaken = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM app_users
                    WHERE id = ?
                )
                """, Boolean.class, preferredUserId);
        return Boolean.TRUE.equals(preferredIdTaken) ? UUID.randomUUID() : preferredUserId;
    }

    private void seedUserRoles() {
        assignRole(superAdminUserId, null, "SUPER_ADMIN");
        assignRole(tenantAdminUserId, DEMO_TENANT_ID, "TENANT_ADMIN");
        assignRole(workerUserId, DEMO_TENANT_ID, "FIELD_WORKER");
    }

    private void assignRole(UUID userId, UUID tenantId, String roleCode) {
        jdbcTemplate.update("""
                INSERT INTO user_tenant_roles (tenant_id, user_id, role_id, created_at)
                SELECT ?, ?, r.id, now()
                FROM roles r
                WHERE r.code = ?
                  AND NOT EXISTS (
                      SELECT 1
                      FROM user_tenant_roles utr
                      WHERE utr.user_id = ?
                        AND utr.role_id = r.id
                        AND (utr.tenant_id IS NOT DISTINCT FROM ?)
                  )
                """, tenantId, userId, roleCode, userId, tenantId);
    }

    private void seedPropertyManagementData() {
        seedOwner(OWNER_PATEL_ID, "Patel Family Holdings", "ops@patelholdings.example", "+1-555-0201", "billing@patelholdings.example", "Prefers text updates after service visits.");
        seedOwner(OWNER_MARTIN_ID, "Martin Lakeside Trust", "hello@martintrust.example", "+1-555-0202", "billing@martintrust.example", "Seasonal pool and landscaping contract.");
        seedProperty(PROPERTY_OAKRIDGE_ID, OWNER_PATEL_ID, "Oakridge Duplex", "144 Oakridge Avenue", "Toronto", "ON", "M4P 1A1", "Basement shutoff is behind labeled storage panel.");
        seedProperty(PROPERTY_BAYVIEW_ID, OWNER_MARTIN_ID, "Bayview Pool Home", "22 Bayview Ridge", "Mississauga", "ON", "L5B 2C2", "Side gate code 4281. Pool equipment shed is keyed alike with garage.");

        seedCategory(CATEGORY_PLUMBING_ID, "Plumbing");
        seedCategory(CATEGORY_POOL_ID, "Swimming Pool");
        seedCategory(CATEGORY_LANDSCAPE_ID, "Landscaping");
        seedServiceType(CATEGORY_PLUMBING_ID, "Leak inspection", "Trace leaks, isolate shutoff, and document repair recommendation.", 90, "145.00");
        seedServiceType(CATEGORY_PLUMBING_ID, "Fixture replacement", "Replace faucets, toilets, valves, or small fixtures.", 120, "225.00");
        seedServiceType(CATEGORY_POOL_ID, "Pool opening", "Seasonal opening with equipment startup and chemical balance.", 180, "390.00");
        seedServiceType(CATEGORY_POOL_ID, "Pool maintenance visit", "Skim, vacuum, test water, and check pump/filter.", 75, "115.00");
        seedServiceType(CATEGORY_LANDSCAPE_ID, "Lawn and garden service", "Mow, edge, trim, and clear light debris.", 90, "130.00");
    }

    private void seedOwner(UUID ownerId, String displayName, String email, String phone, String billingEmail, String notes) {
        jdbcTemplate.update("""
                INSERT INTO customers (id, tenant_id, display_name, email, phone, billing_email, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    billing_email = EXCLUDED.billing_email,
                    notes = EXCLUDED.notes,
                    updated_at = now()
                """, ownerId, DEMO_TENANT_ID, displayName, email, phone, billingEmail, notes);
    }

    private void seedProperty(UUID propertyId, UUID ownerId, String name, String addressLine1, String city, String provinceCode, String postalCode, String serviceNotes) {
        jdbcTemplate.update("""
                INSERT INTO properties (id, tenant_id, customer_id, name, address_line1, city, province_code, postal_code, country_code, service_notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CA', ?)
                ON CONFLICT (id) DO UPDATE SET
                    customer_id = EXCLUDED.customer_id,
                    name = EXCLUDED.name,
                    address_line1 = EXCLUDED.address_line1,
                    city = EXCLUDED.city,
                    province_code = EXCLUDED.province_code,
                    postal_code = EXCLUDED.postal_code,
                    service_notes = EXCLUDED.service_notes,
                    active = true,
                    updated_at = now()
                """, propertyId, DEMO_TENANT_ID, ownerId, name, addressLine1, city, provinceCode, postalCode, serviceNotes);
    }

    private void seedCategory(UUID categoryId, String name) {
        jdbcTemplate.update("""
                INSERT INTO service_categories (id, tenant_id, name)
                VALUES (?, ?, ?)
                ON CONFLICT (tenant_id, name) DO UPDATE SET
                    active = true,
                    updated_at = now()
                """, categoryId, DEMO_TENANT_ID, name);
    }

    private void seedServiceType(UUID categoryId, String name, String description, int durationMinutes, String basePrice) {
        jdbcTemplate.update("""
                INSERT INTO service_types (tenant_id, category_id, name, description, default_duration_minutes, base_price)
                VALUES (?, ?, ?, ?, ?, ?::numeric)
                ON CONFLICT (tenant_id, name) DO UPDATE SET
                    category_id = EXCLUDED.category_id,
                    description = EXCLUDED.description,
                    default_duration_minutes = EXCLUDED.default_duration_minutes,
                    base_price = EXCLUDED.base_price,
                    active = true,
                    updated_at = now()
                """, DEMO_TENANT_ID, categoryId, name, description, durationMinutes, basePrice);
    }

    private void seedWorkerProfile() {
        jdbcTemplate.update("""
                INSERT INTO workers (tenant_id, user_id, employee_number, display_name, phone, email, status, hourly_rate)
                VALUES (?, ?, 'FW-001', 'Field Worker', '+1-555-0102', 'worker@lorne.local', 'ACTIVE', 28.00)
                ON CONFLICT (tenant_id, employee_number) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    display_name = EXCLUDED.display_name,
                    status = 'ACTIVE',
                    updated_at = now()
                """, DEMO_TENANT_ID, workerUserId);
    }
}
