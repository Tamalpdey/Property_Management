package com.lorne.platform.auth.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.auth.internal.dto.CreateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.TenantRoleDto;
import com.lorne.platform.auth.internal.dto.TenantRecipientDto;
import com.lorne.platform.auth.internal.dto.TenantUserDto;
import com.lorne.platform.auth.internal.dto.UpdateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.UpdateTenantPortalAccessRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenantUserManagementService {
    private static final Set<String> TENANT_ASSIGNABLE_ROLES = Set.of("TENANT_ADMIN", "OPERATIONS", "FINANCE", "FIELD_WORKER", "CUSTOMER");

    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final AuditWriter auditWriter;

    TenantUserManagementService(JdbcTemplate jdbcTemplate, PasswordEncoder passwordEncoder, AuditWriter auditWriter) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<TenantUserDto> list(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT u.id, u.display_name, u.email, u.phone, u.status::text AS status, u.last_login_at, u.created_at,
                       string_agg(r.code, ',' ORDER BY r.code) AS role_codes,
                       u.profile_photo_url,
                       w.id AS worker_id, w.display_name AS worker_name
                FROM app_users u
                JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id = ?
                JOIN roles r ON r.id = utr.role_id
                LEFT JOIN workers w ON w.tenant_id = utr.tenant_id AND w.user_id = u.id
                GROUP BY u.id, u.display_name, u.profile_photo_url, u.email, u.phone, u.status, u.last_login_at, u.created_at, w.id, w.display_name
                ORDER BY u.display_name
                """, (rs, rowNum) -> new TenantUserDto(
                rs.getObject("id", UUID.class),
                rs.getString("display_name"),
                rs.getString("profile_photo_url"),
                rs.getString("email"),
                rs.getString("phone"),
                rs.getString("status"),
                splitRoles(rs.getString("role_codes")),
                rs.getObject("worker_id", UUID.class),
                rs.getString("worker_name"),
                rs.getTimestamp("last_login_at") == null ? null : rs.getTimestamp("last_login_at").toInstant(),
                rs.getTimestamp("created_at").toInstant()
        ), tenantId);
    }

    @Transactional(readOnly = true)
    public List<TenantRoleDto> roles() {
        return jdbcTemplate.query("""
                SELECT code, display_name
                FROM roles
                WHERE platform_role = false
                  AND code IN ('TENANT_ADMIN', 'OPERATIONS', 'FINANCE', 'FIELD_WORKER', 'CUSTOMER')
                ORDER BY CASE code
                    WHEN 'TENANT_ADMIN' THEN 1
                    WHEN 'OPERATIONS' THEN 2
                    WHEN 'FINANCE' THEN 3
                    WHEN 'FIELD_WORKER' THEN 4
                    WHEN 'CUSTOMER' THEN 5
                    ELSE 99
                END
                """, (rs, rowNum) -> new TenantRoleDto(rs.getString("code"), rs.getString("display_name")));
    }

    @Transactional(readOnly = true)
    public List<TenantRecipientDto> recipients(UUID tenantId) {
        return jdbcTemplate.query("""
                SELECT u.id, u.display_name, u.email, u.status::text AS status,
                       string_agg(r.code, ',' ORDER BY r.code) AS role_codes
                FROM app_users u
                JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id = ?
                JOIN roles r ON r.id = utr.role_id
                WHERE u.status = 'ACTIVE'
                GROUP BY u.id, u.display_name, u.email, u.status
                ORDER BY u.display_name
                """, (rs, rowNum) -> new TenantRecipientDto(rs.getObject("id", UUID.class),
                rs.getString("display_name"), rs.getString("email"), rs.getString("status"),
                splitRoles(rs.getString("role_codes"))), tenantId);
    }

    @Transactional
    public TenantUserDto create(UUID tenantId, UUID actorUserId, CreateTenantUserRequest request) {
        lockUserAdministration(tenantId, actorUserId);
        var roles = normalizeRoles(request.roles());
        var email = request.email().trim().toLowerCase();
        var password = request.temporaryPassword() == null ? "" : request.temporaryPassword().trim();
        if (password.length() < 8) {
            throw new BadRequestException("Temporary password must be at least 8 characters.");
        }
        var fieldWorker = roles.contains("FIELD_WORKER");
        if (request.workerId() != null && !fieldWorker) {
            throw new BadRequestException("Worker profile can only be linked when Field Worker role is selected.");
        }

        var userId = userIdByEmail(email);
        if (userId != null && !roles.contains("TENANT_ADMIN")) {
            requireAnotherAdministrator(tenantId, userId);
        }
        if (userId == null) {
            userId = createUser(email, request.displayName().trim(), blankToNull(request.profilePhotoUrl()), blankToNull(request.phone()), password, actorUserId);
        } else {
            jdbcTemplate.update("""
                    UPDATE app_users
                    SET display_name = ?, profile_photo_url = ?, phone = ?, password_hash = ?, status = 'ACTIVE'::user_status,
                        updated_at = now(), updated_by = ?
                    WHERE id = ?
                    """, request.displayName().trim(), blankToNull(request.profilePhotoUrl()), blankToNull(request.phone()), passwordEncoder.encode(password), actorUserId, userId);
        }

        replaceTenantRoles(tenantId, actorUserId, userId, roles);
        var workerId = fieldWorker
                ? resolveWorkerProfile(tenantId, actorUserId, userId, request)
                : null;
        linkWorkerProfile(tenantId, actorUserId, userId, workerId);
        if (workerId != null) {
            syncWorkerProfileContact(tenantId, actorUserId, workerId, request.displayName().trim(), blankToNull(request.phone()), email);
        }
        auditWriter.record(tenantId, actorUserId, "TENANT_USER_UPSERTED", "USER", userId, Map.of(
                "email", email,
                "profilePhotoConfigured", request.profilePhotoUrl() != null && !request.profilePhotoUrl().isBlank(),
                "roles", roles,
                "workerId", workerId == null ? "" : workerId
        ));
        var createdUserId = userId;
        return list(tenantId).stream()
                .filter(user -> user.id().equals(createdUserId))
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    public TenantUserDto update(UUID tenantId, UUID actorUserId, UUID userId, UpdateTenantUserRequest request) {
        lockUserAdministration(tenantId, actorUserId);
        requireTenantUser(tenantId, userId);
        var roles = normalizeRoles(request.roles());
        if (!roles.contains("TENANT_ADMIN")) {
            requireAnotherAdministrator(tenantId, userId);
        }
        var email = request.email().trim().toLowerCase();
        var password = request.temporaryPassword() == null ? "" : request.temporaryPassword().trim();
        if (!password.isBlank() && password.length() < 8) {
            throw new BadRequestException("Temporary password must be at least 8 characters.");
        }
        var fieldWorker = roles.contains("FIELD_WORKER");
        if (request.workerId() != null && !fieldWorker) {
            throw new BadRequestException("Worker profile can only be linked when Field Worker role is selected.");
        }

        try {
            var updated = password.isBlank()
                    ? jdbcTemplate.update("""
                            UPDATE app_users
                            SET display_name = ?, profile_photo_url = ?, email = ?, phone = ?, updated_at = now(), updated_by = ?
                            WHERE id = ?
                            """, request.displayName().trim(), blankToNull(request.profilePhotoUrl()), email, blankToNull(request.phone()), actorUserId, userId)
                    : jdbcTemplate.update("""
                            UPDATE app_users
                            SET display_name = ?, profile_photo_url = ?, email = ?, phone = ?, password_hash = ?, status = 'ACTIVE'::user_status,
                                updated_at = now(), updated_by = ?
                            WHERE id = ?
                            """, request.displayName().trim(), blankToNull(request.profilePhotoUrl()), email, blankToNull(request.phone()), passwordEncoder.encode(password), actorUserId, userId);
            if (updated != 1) {
                throw new ResourceNotFoundException("Tenant user not found.");
            }
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("User email already exists.");
        }

        replaceTenantRoles(tenantId, actorUserId, userId, roles);
        var workerId = fieldWorker
                ? resolveWorkerProfile(tenantId, actorUserId, userId, request)
                : null;
        linkWorkerProfile(tenantId, actorUserId, userId, workerId);
        if (workerId != null) {
            syncWorkerProfileContact(tenantId, actorUserId, workerId, request.displayName().trim(), blankToNull(request.phone()), email);
        }
        auditWriter.record(tenantId, actorUserId, "TENANT_USER_UPDATED", "USER", userId, Map.of(
                "email", email,
                "profilePhotoConfigured", request.profilePhotoUrl() != null && !request.profilePhotoUrl().isBlank(),
                "roles", roles,
                "workerId", workerId == null ? "" : workerId
        ));
        return find(tenantId, userId);
    }

    @Transactional
    public TenantUserDto updateStatus(UUID tenantId, UUID actorUserId, UUID userId, String status) {
        lockUserAdministration(tenantId, actorUserId);
        requireTenantUser(tenantId, userId);
        if (!Set.of("ACTIVE", "DISABLED").contains(status)) {
            throw new BadRequestException("User status is not supported.");
        }
        if (actorUserId.equals(userId) && status.equals("DISABLED")) {
            throw new BadRequestException("You cannot deactivate your own login.");
        }
        if ("DISABLED".equals(status)) {
            // Login status is global, so protect every tenant this user administers.
            var tenantIds = jdbcTemplate.queryForList("SELECT DISTINCT tenant_id FROM user_tenant_roles WHERE user_id = ? AND tenant_id IS NOT NULL", UUID.class, userId);
            tenantIds.forEach(id -> requireAnotherAdministrator(id, userId));
        }
        jdbcTemplate.update("""
                UPDATE app_users
                SET status = ?::user_status, updated_at = now(), updated_by = ?
                WHERE id = ?
                """, status, actorUserId, userId);
        if ("DISABLED".equals(status)) {
            revokeRefreshSessions(userId, null);
        }
        auditWriter.record(tenantId, actorUserId, status.equals("ACTIVE") ? "TENANT_USER_ACTIVATED" : "TENANT_USER_DEACTIVATED", "USER", userId, Map.of(
                "status", status
        ));
        return find(tenantId, userId);
    }

    @Transactional
    public void delete(UUID tenantId, UUID actorUserId, UUID userId) {
        lockUserAdministration(tenantId, actorUserId);
        requireTenantUser(tenantId, userId);
        if (actorUserId.equals(userId)) {
            throw new BadRequestException("You cannot remove your own login from the tenant.");
        }
        requireAnotherAdministrator(tenantId, userId);
        jdbcTemplate.update("""
                UPDATE workers
                SET user_id = NULL, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND user_id = ?
                """, actorUserId, tenantId, userId);
        jdbcTemplate.update("""
                DELETE FROM user_tenant_roles
                WHERE tenant_id = ? AND user_id = ?
                """, tenantId, userId);
        var remainingTenantRoles = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM user_tenant_roles
                WHERE user_id = ?
                """, Integer.class, userId);
        if (remainingTenantRoles == null || remainingTenantRoles == 0) {
            jdbcTemplate.update("""
                    UPDATE app_users
                    SET status = 'DISABLED'::user_status, updated_at = now(), updated_by = ?
                    WHERE id = ?
                    """, actorUserId, userId);
            revokeRefreshSessions(userId, null);
        } else {
            revokeRefreshSessions(userId, tenantId);
        }
        auditWriter.record(tenantId, actorUserId, "TENANT_USER_REMOVED", "USER", userId, Map.of(
                "remainingTenantRoles", remainingTenantRoles == null ? 0 : remainingTenantRoles
        ));
    }

    private void lockUserAdministration(UUID tenantId, UUID actorUserId) {
        // Serialize these infrequent edits across tenants: account status is shared globally.
        jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(741028, 1)");
        var allowed = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                    JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                    WHERE utr.tenant_id = ? AND utr.user_id = ?
                )
                """, Boolean.class, tenantId, actorUserId);
        if (!Boolean.TRUE.equals(allowed)) {
            throw new org.springframework.security.access.AccessDeniedException("Only an active tenant administrator can manage users.");
        }
    }

    @Transactional
    public TenantUserDto updatePortalAccess(UUID tenantId, UUID actorUserId, UUID userId, UpdateTenantPortalAccessRequest request) {
        jdbcTemplate.queryForList("SELECT pg_advisory_xact_lock(741028, 1)");
        var platformAdmin = jdbcTemplate.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id AND r.code = 'SUPER_ADMIN'
                    JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                    WHERE utr.user_id = ? AND utr.tenant_id IS NULL)
                """, Boolean.class, actorUserId);
        if (!Boolean.TRUE.equals(platformAdmin)) {
            throw new org.springframework.security.access.AccessDeniedException("An active platform administrator is required.");
        }
        requireTenantUser(tenantId, userId);
        var reason = request.reason() == null ? "" : request.reason().trim();
        if (reason.length() < 10 || reason.length() > 1000) throw new BadRequestException("Enter a support reason between 10 and 1000 characters.");
        var portalRoles = Set.of("TENANT_ADMIN", "OPERATIONS", "FINANCE");
        if (request.portalRoles() == null || request.portalRoles().stream().anyMatch(role -> role == null || !portalRoles.contains(role))) {
            throw new BadRequestException("Only Tenant Admin, Operations and Finance portal roles can be assigned here.");
        }
        var previous = find(tenantId, userId);
        var roles = new LinkedHashSet<>(previous.roles());
        roles.removeAll(portalRoles);
        roles.addAll(request.portalRoles());
        if (roles.isEmpty()) throw new BadRequestException("At least one tenant role must remain on this account.");
        if (!roles.contains("TENANT_ADMIN")) requireAnotherAdministrator(tenantId, userId);
        if (roles.contains("TENANT_ADMIN") && !"ACTIVE".equals(previous.status()) && !request.reactivate()) {
            throw new BadRequestException("Confirm account reactivation before assigning Tenant Admin to an inactive login.");
        }
        if (request.reactivate() && !"ACTIVE".equals(previous.status())) {
            jdbcTemplate.update("UPDATE app_users SET status = 'ACTIVE'::user_status, updated_at = now(), updated_by = ? WHERE id = ?", actorUserId, userId);
            revokeRefreshSessions(userId, null);
        }
        replaceTenantRoles(tenantId, actorUserId, userId, roles);
        revokeRefreshSessions(userId, tenantId);
        auditWriter.record(tenantId, actorUserId, "SUPERADMIN_USER_ACCESS_UPDATED", "PLATFORM_ACCESS", userId, Map.of(
                "userEmail", previous.email(), "previousRoles", previous.roles(), "roles", roles,
                "reactivated", request.reactivate() && !"ACTIVE".equals(previous.status()), "reason", reason));
        auditWriter.record(tenantId, actorUserId, "TENANT_USER_ACCESS_UPDATED", "USER", userId, Map.of(
                "previousRoles", previous.roles(), "roles", roles,
                "reactivated", request.reactivate() && !"ACTIVE".equals(previous.status())));
        return find(tenantId, userId);
    }

    private void requireAnotherAdministrator(UUID tenantId, UUID userId) {
        var removesLastAdmin = jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                    JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                    WHERE utr.tenant_id = ? AND utr.user_id = ?
                ) AND NOT EXISTS (
                    SELECT 1 FROM user_tenant_roles utr
                    JOIN roles r ON r.id = utr.role_id AND r.code = 'TENANT_ADMIN'
                    JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                    WHERE utr.tenant_id = ? AND utr.user_id <> ?
                )
                """, Boolean.class, tenantId, userId, tenantId, userId);
        if (Boolean.TRUE.equals(removesLastAdmin)) {
            throw new BadRequestException("At least one active Tenant Admin must remain in each tenant. Add or promote another active Tenant Admin before changing this user.");
        }
    }

    private UUID createUser(String email, String displayName, String profilePhotoUrl, String phone, String password, UUID actorUserId) {
        try {
            return jdbcTemplate.queryForObject("""
                    INSERT INTO app_users (email, display_name, profile_photo_url, phone, password_hash, status, created_by, updated_by)
                    VALUES (?, ?, ?, ?, ?, 'ACTIVE'::user_status, ?, ?)
                    RETURNING id
                    """, UUID.class, email, displayName, profilePhotoUrl, phone, passwordEncoder.encode(password), actorUserId, actorUserId);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("User email already exists.");
        }
    }

    private void replaceTenantRoles(UUID tenantId, UUID actorUserId, UUID userId, Set<String> roles) {
        jdbcTemplate.update("""
                DELETE FROM user_tenant_roles
                WHERE tenant_id = ?
                  AND user_id = ?
                """, tenantId, userId);
        for (var role : roles) {
            jdbcTemplate.update("""
                    INSERT INTO user_tenant_roles (tenant_id, user_id, role_id, created_by)
                    SELECT ?, ?, r.id, ?
                    FROM roles r
                    WHERE r.code = ?
                    """, tenantId, userId, actorUserId, role);
        }
    }

    private void linkWorkerProfile(UUID tenantId, UUID actorUserId, UUID userId, UUID workerId) {
        jdbcTemplate.update("""
                UPDATE workers
                SET user_id = NULL, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND user_id = ?
                """, actorUserId, tenantId, userId);
        if (workerId == null) {
            return;
        }
        var updated = jdbcTemplate.update("""
                UPDATE workers
                SET user_id = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ?
                  AND id = ?
                  AND (user_id IS NULL OR user_id = ?)
                """, userId, actorUserId, tenantId, workerId, userId);
        if (updated != 1) {
            throw new BadRequestException("Worker profile is not available or is linked to another user.");
        }
    }

    private UUID resolveWorkerProfile(UUID tenantId, UUID actorUserId, UUID userId, CreateTenantUserRequest request) {
        if (request.workerId() != null) {
            return request.workerId();
        }
        var existingWorkerId = workerIdByUser(tenantId, userId);
        if (existingWorkerId != null) {
            return existingWorkerId;
        }
        var matchingWorkerId = workerIdByEmail(tenantId, userId, request.email());
        if (matchingWorkerId != null) return matchingWorkerId;
        return jdbcTemplate.queryForObject("""
                INSERT INTO workers (tenant_id, user_id, display_name, phone, email, status, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE'::worker_status, ?, ?)
                RETURNING id
                """,
                UUID.class,
                tenantId,
                userId,
                request.displayName().trim(),
                blankToNull(request.phone()),
                request.email().trim().toLowerCase(),
                actorUserId,
                actorUserId
        );
    }

    private UUID resolveWorkerProfile(UUID tenantId, UUID actorUserId, UUID userId, UpdateTenantUserRequest request) {
        if (request.workerId() != null) {
            return request.workerId();
        }
        var existingWorkerId = workerIdByUser(tenantId, userId);
        if (existingWorkerId != null) {
            return existingWorkerId;
        }
        var matchingWorkerId = workerIdByEmail(tenantId, userId, request.email());
        if (matchingWorkerId != null) return matchingWorkerId;
        return jdbcTemplate.queryForObject("""
                INSERT INTO workers (tenant_id, user_id, display_name, phone, email, status, created_by, updated_by)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE'::worker_status, ?, ?)
                RETURNING id
                """,
                UUID.class,
                tenantId,
                userId,
                request.displayName().trim(),
                blankToNull(request.phone()),
                request.email().trim().toLowerCase(),
                actorUserId,
                actorUserId
        );
    }

    private UUID workerIdByUser(UUID tenantId, UUID userId) {
        var workerIds = jdbcTemplate.query("""
                SELECT id
                FROM workers
                WHERE tenant_id = ?
                  AND user_id = ?
                ORDER BY created_at
                LIMIT 1
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), tenantId, userId);
        return workerIds.isEmpty() ? null : workerIds.getFirst();
    }

    private UUID workerIdByEmail(UUID tenantId, UUID userId, String email) {
        var matches = jdbcTemplate.query("""
                SELECT id, user_id FROM workers
                WHERE tenant_id = ? AND lower(btrim(email::text)) = lower(btrim(?))
                FOR UPDATE
                """, (rs, row) -> new WorkerLink(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class)), tenantId, email);
        if (matches.size() > 1) {
            throw new BadRequestException("More than one worker profile uses this email. Select the profile assigned to the work orders under Linked worker profile.");
        }
        if (matches.isEmpty()) return null;
        var worker = matches.getFirst();
        if (worker.userId() != null && !worker.userId().equals(userId)) {
            throw new BadRequestException("The worker profile with this email is linked to another login. Select the correct worker profile explicitly.");
        }
        return worker.id();
    }

    private record WorkerLink(UUID id, UUID userId) { }

    private void syncWorkerProfileContact(UUID tenantId, UUID actorUserId, UUID workerId, String displayName, String phone, String email) {
        try {
        jdbcTemplate.update("""
                UPDATE workers
                SET display_name = ?, phone = ?, email = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, displayName, phone, email, actorUserId, tenantId, workerId);
        } catch (DuplicateKeyException exception) {
            throw new DuplicateResourceException("Another worker profile already uses this email in this tenant. Resolve the duplicate worker profiles before changing the login link.");
        }
    }

    private UUID userIdByEmail(String email) {
        var userIds = jdbcTemplate.query("""
                SELECT id
                FROM app_users
                WHERE lower(email) = lower(?)
                """, (rs, rowNum) -> rs.getObject("id", UUID.class), email);
        return userIds.isEmpty() ? null : userIds.getFirst();
    }

    private Set<String> normalizeRoles(List<String> roleCodes) {
        if (roleCodes == null || roleCodes.isEmpty()) {
            throw new BadRequestException("At least one tenant role is required.");
        }
        var roles = new LinkedHashSet<String>();
        for (var roleCode : roleCodes) {
            var role = roleCode == null ? "" : roleCode.trim().toUpperCase();
            if (!TENANT_ASSIGNABLE_ROLES.contains(role)) {
                throw new BadRequestException("Role is not assignable by tenant admin.");
            }
            roles.add(role);
        }
        if (roles.isEmpty()) {
            throw new BadRequestException("At least one tenant role is required.");
        }
        return roles;
    }

    private List<String> splitRoles(String roleCodes) {
        if (roleCodes == null || roleCodes.isBlank()) {
            return List.of();
        }
        return Arrays.stream(roleCodes.split(",")).toList();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void requireTenantUser(UUID tenantId, UUID userId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)::int
                FROM user_tenant_roles
                WHERE tenant_id = ? AND user_id = ?
                """, Integer.class, tenantId, userId);
        if (count == null || count == 0) {
            throw new ResourceNotFoundException("Tenant user not found.");
        }
    }

    private TenantUserDto find(UUID tenantId, UUID userId) {
        return list(tenantId).stream()
                .filter(user -> user.id().equals(userId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Tenant user not found."));
    }

    private void revokeRefreshSessions(UUID userId, UUID tenantId) {
        if (tenantId == null) {
            jdbcTemplate.update("""
                    UPDATE auth_refresh_sessions
                    SET revoked_at = now()
                    WHERE user_id = ?
                      AND revoked_at IS NULL
                    """, userId);
            return;
        }
        jdbcTemplate.update("""
                UPDATE auth_refresh_sessions
                SET revoked_at = now()
                WHERE user_id = ?
                  AND tenant_id = ?
                  AND revoked_at IS NULL
                """, userId, tenantId);
    }
}
