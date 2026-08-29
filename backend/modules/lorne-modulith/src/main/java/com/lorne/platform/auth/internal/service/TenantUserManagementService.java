package com.lorne.platform.auth.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.auth.internal.dto.CreateTenantUserRequest;
import com.lorne.platform.auth.internal.dto.TenantRoleDto;
import com.lorne.platform.auth.internal.dto.TenantUserDto;
import com.lorne.platform.auth.internal.dto.UpdateTenantUserRequest;
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

    @Transactional
    public TenantUserDto create(UUID tenantId, UUID actorUserId, CreateTenantUserRequest request) {
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
        requireTenantUser(tenantId, userId);
        var roles = normalizeRoles(request.roles());
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
        requireTenantUser(tenantId, userId);
        if (!Set.of("ACTIVE", "DISABLED").contains(status)) {
            throw new BadRequestException("User status is not supported.");
        }
        if (actorUserId.equals(userId) && status.equals("DISABLED")) {
            throw new BadRequestException("You cannot deactivate your own login.");
        }
        jdbcTemplate.update("""
                UPDATE app_users
                SET status = ?::user_status, updated_at = now(), updated_by = ?
                WHERE id = ?
                """, status, actorUserId, userId);
        if ("DISABLED".equals(status)) {
            revokeRefreshSessions(userId, tenantId);
        }
        auditWriter.record(tenantId, actorUserId, status.equals("ACTIVE") ? "TENANT_USER_ACTIVATED" : "TENANT_USER_DEACTIVATED", "USER", userId, Map.of(
                "status", status
        ));
        return find(tenantId, userId);
    }

    @Transactional
    public void delete(UUID tenantId, UUID actorUserId, UUID userId) {
        requireTenantUser(tenantId, userId);
        if (actorUserId.equals(userId)) {
            throw new BadRequestException("You cannot remove your own login from the tenant.");
        }
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

    private void syncWorkerProfileContact(UUID tenantId, UUID actorUserId, UUID workerId, String displayName, String phone, String email) {
        jdbcTemplate.update("""
                UPDATE workers
                SET display_name = ?, phone = ?, email = ?, updated_at = now(), updated_by = ?
                WHERE tenant_id = ? AND id = ?
                """, displayName, phone, email, actorUserId, tenantId, workerId);
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
