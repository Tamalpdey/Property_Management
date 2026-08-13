package com.lorne.platform.auth.internal.service;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.auth.internal.dto.LoginRequest;
import com.lorne.platform.auth.internal.dto.LoginResponse;
import com.lorne.platform.auth.internal.dto.LogoutRequest;
import com.lorne.platform.auth.internal.dto.RefreshTokenRequest;
import com.lorne.platform.auth.internal.entity.UserAccount;
import com.lorne.platform.auth.internal.entity.UserStatus;
import com.lorne.platform.auth.internal.repository.UserAccountRepository;
import com.lorne.platform.auth.internal.repository.UserTenantRoleRepository;
import com.lorne.platform.auth.internal.security.TokenProvider;
import com.lorne.platform.security.LorneRole;
import com.lorne.platform.security.RolePermissionRegistry;
import com.lorne.platform.shared.exception.ErrorCode;
import com.lorne.platform.shared.exception.LorneException;
import com.lorne.platform.shared.security.JwtPrincipal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final UserAccountRepository userAccountRepository;
    private final UserTenantRoleRepository userTenantRoleRepository;
    private final PasswordEncoder passwordEncoder;
    private final TokenProvider tokenProvider;
    private final RolePermissionRegistry rolePermissionRegistry;
    private final JdbcTemplate jdbcTemplate;
    private final SecureRandom secureRandom = new SecureRandom();
    private final Duration workerRefreshTokenExpiration;
    private final Duration tenantRefreshTokenExpiration;
    private final Duration adminRefreshTokenExpiration;

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserTenantRoleRepository userTenantRoleRepository,
            PasswordEncoder passwordEncoder,
            TokenProvider tokenProvider,
            RolePermissionRegistry rolePermissionRegistry,
            JdbcTemplate jdbcTemplate,
            @Value("${lorne.jwt.refresh-token.worker-expiration-days:${LORNE_REFRESH_TOKEN_WORKER_EXPIRATION_DAYS:30}}") long workerRefreshTokenExpirationDays,
            @Value("${lorne.jwt.refresh-token.tenant-expiration-days:${LORNE_REFRESH_TOKEN_TENANT_EXPIRATION_DAYS:7}}") long tenantRefreshTokenExpirationDays,
            @Value("${lorne.jwt.refresh-token.admin-expiration-days:${LORNE_REFRESH_TOKEN_ADMIN_EXPIRATION_DAYS:1}}") long adminRefreshTokenExpirationDays
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userTenantRoleRepository = userTenantRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.rolePermissionRegistry = rolePermissionRegistry;
        this.jdbcTemplate = jdbcTemplate;
        this.workerRefreshTokenExpiration = Duration.ofDays(workerRefreshTokenExpirationDays);
        this.tenantRefreshTokenExpiration = Duration.ofDays(tenantRefreshTokenExpirationDays);
        this.adminRefreshTokenExpiration = Duration.ofDays(adminRefreshTokenExpirationDays);
    }

    @Transactional
    public LoginResponse login(LoginRequest request, String source) {
        var email = request.email().trim();
        var user = userAccountRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> {
                    log.warn("auth_login_failed email={} tenantId={} reason=user_not_found", email, request.tenantId());
                    return invalidCredentials();
                });

        if (user.status() != UserStatus.ACTIVE) {
            log.warn("auth_login_failed email={} tenantId={} reason=user_not_active status={}", email, request.tenantId(), user.status());
            throw new LorneException(ErrorCode.UNAUTHORIZED, "User is not active");
        }
        if (user.passwordHash() == null || !passwordEncoder.matches(request.password(), user.passwordHash())) {
            log.warn("auth_login_failed email={} tenantId={} reason=bad_password", email, request.tenantId());
            throw invalidCredentials();
        }

        var currentUser = buildCurrentUser(user, request.tenantId());
        user.recordSuccessfulLogin();
        log.info("auth_login_success userId={} email={} tenantId={} roles={}", user.id(), email, currentUser.tenantId(), currentUser.roles());

        return sessionResponse(currentUser, issueRefreshToken(currentUser, source));
    }

    @Transactional
    public LoginResponse refresh(RefreshTokenRequest request, String source) {
        var refreshToken = request.refreshToken().trim();
        var tokenHash = tokenHash(refreshToken);
        var session = findRefreshSession(tokenHash);
        if (session == null || session.revokedAt() != null || !session.expiresAt().isAfter(Instant.now())) {
            throw invalidCredentials();
        }

        var user = userAccountRepository.findById(session.userId())
                .orElseThrow(this::invalidCredentials);
        if (user.status() != UserStatus.ACTIVE) {
            revokeRefreshSession(session.id());
            throw new LorneException(ErrorCode.UNAUTHORIZED, "User is not active");
        }

        var currentUser = buildCurrentUser(user, session.tenantId());
        revokeRefreshSession(session.id());
        log.info("auth_refresh_success userId={} tenantId={} clientType={}", user.id(), currentUser.tenantId(), session.clientType());
        return sessionResponse(currentUser, issueRefreshToken(currentUser, source == null ? session.source() : source));
    }

    @Transactional
    public void logout(LogoutRequest request) {
        if (request == null || request.refreshToken() == null || request.refreshToken().isBlank()) {
            return;
        }
        jdbcTemplate.update("""
                UPDATE auth_refresh_sessions
                SET revoked_at = now(), last_used_at = now()
                WHERE token_hash = ? AND revoked_at IS NULL
                """, tokenHash(request.refreshToken().trim()));
    }

    @Transactional(readOnly = true)
    public CurrentUserResponse currentUser(JwtPrincipal principal) {
        return new CurrentUserResponse(
                principal.userId(),
                principal.tenantId(),
                principal.displayName(),
                principal.email(),
                principal.roles(),
                principal.permissions()
        );
    }

    private CurrentUserResponse buildCurrentUser(UserAccount user, UUID requestedTenantId) {
        var assignments = userTenantRoleRepository.findByUserId(user.id());
        if (assignments.isEmpty()) {
            throw new LorneException(ErrorCode.FORBIDDEN, "User has no assigned role");
        }

        var matchingAssignments = requestedTenantId == null
                ? assignments
                : assignments.stream()
                        .filter(assignment -> requestedTenantId.equals(assignment.tenantId()))
                        .toList();

        if (matchingAssignments.isEmpty()) {
            throw new LorneException(ErrorCode.FORBIDDEN, "User is not assigned to the requested tenant");
        }

        var tenantId = requestedTenantId != null
                ? requestedTenantId
                : matchingAssignments.stream()
                        .map(assignment -> assignment.tenantId())
                        .filter(id -> id != null)
                        .findFirst()
                        .orElse(null);

        var roles = matchingAssignments.stream()
                .map(assignment -> assignment.role().code())
                .distinct()
                .sorted()
                .toList();

        var permissions = roles.stream()
                .map(LorneRole::valueOf)
                .flatMap(role -> rolePermissionRegistry.permissionsFor(role).stream())
                .map(Enum::name)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();

        return new CurrentUserResponse(user.id(), tenantId, user.displayName(), user.email(), roles, permissions);
    }

    private LoginResponse sessionResponse(CurrentUserResponse currentUser, IssuedRefreshToken refreshToken) {
        return new LoginResponse(
                tokenProvider.generateAccessToken(currentUser),
                refreshToken.token(),
                "Bearer",
                tokenProvider.accessTokenExpirationSeconds(),
                refreshToken.expiresInSeconds(),
                currentUser
        );
    }

    private IssuedRefreshToken issueRefreshToken(CurrentUserResponse currentUser, String source) {
        var token = secureToken();
        var clientType = clientType(currentUser.roles());
        var expiresAt = Instant.now().plus(refreshTokenExpiration(clientType));
        jdbcTemplate.update("""
                INSERT INTO auth_refresh_sessions (
                    user_id, tenant_id, token_hash, client_type, source, expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                currentUser.id(),
                currentUser.tenantId(),
                tokenHash(token),
                clientType,
                normalizeSource(source),
                Timestamp.from(expiresAt));
        return new IssuedRefreshToken(token, Duration.between(Instant.now(), expiresAt).toSeconds());
    }

    private RefreshSession findRefreshSession(String tokenHash) {
        try {
            return jdbcTemplate.queryForObject("""
                    SELECT id, user_id, tenant_id, client_type, source, expires_at, revoked_at
                    FROM auth_refresh_sessions
                    WHERE token_hash = ?
                    """, (rs, rowNum) -> new RefreshSession(
                    rs.getObject("id", UUID.class),
                    rs.getObject("user_id", UUID.class),
                    rs.getObject("tenant_id", UUID.class),
                    rs.getString("client_type"),
                    rs.getString("source"),
                    rs.getTimestamp("expires_at").toInstant(),
                    rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant()
            ), tokenHash);
        } catch (EmptyResultDataAccessException exception) {
            return null;
        }
    }

    private void revokeRefreshSession(UUID sessionId) {
        jdbcTemplate.update("""
                UPDATE auth_refresh_sessions
                SET revoked_at = now(), last_used_at = now()
                WHERE id = ? AND revoked_at IS NULL
                """, sessionId);
    }

    private String clientType(List<String> roles) {
        if (roles.contains("SUPER_ADMIN")) {
            return "ADMIN";
        }
        if (roles.size() == 1 && roles.contains("FIELD_WORKER")) {
            return "WORKER";
        }
        return "TENANT";
    }

    private Duration refreshTokenExpiration(String clientType) {
        return switch (clientType) {
            case "WORKER" -> workerRefreshTokenExpiration;
            case "ADMIN" -> adminRefreshTokenExpiration;
            default -> tenantRefreshTokenExpiration;
        };
    }

    private String secureToken() {
        var bytes = new byte[48];
        secureRandom.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String tokenHash(String token) {
        try {
            var digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(digest);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is required for refresh token hashing", exception);
        }
    }

    private String normalizeSource(String source) {
        if (source == null || source.isBlank()) {
            return null;
        }
        return source.length() > 80 ? source.substring(0, 80) : source;
    }

    private LorneException invalidCredentials() {
        return new LorneException(ErrorCode.UNAUTHORIZED, "Invalid email or password");
    }

    private record IssuedRefreshToken(String token, long expiresInSeconds) {
    }

    private record RefreshSession(
            UUID id,
            UUID userId,
            UUID tenantId,
            String clientType,
            String source,
            Instant expiresAt,
            Instant revokedAt
    ) {
    }
}
