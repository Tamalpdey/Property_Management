package com.lorne.platform.auth.internal.service;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.auth.internal.dto.LoginRequest;
import com.lorne.platform.auth.internal.dto.LoginResponse;
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
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
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

    public AuthService(
            UserAccountRepository userAccountRepository,
            UserTenantRoleRepository userTenantRoleRepository,
            PasswordEncoder passwordEncoder,
            TokenProvider tokenProvider,
            RolePermissionRegistry rolePermissionRegistry
    ) {
        this.userAccountRepository = userAccountRepository;
        this.userTenantRoleRepository = userTenantRoleRepository;
        this.passwordEncoder = passwordEncoder;
        this.tokenProvider = tokenProvider;
        this.rolePermissionRegistry = rolePermissionRegistry;
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
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

        return new LoginResponse(
                tokenProvider.generateAccessToken(currentUser),
                "Bearer",
                tokenProvider.accessTokenExpirationSeconds(),
                currentUser
        );
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

    private LorneException invalidCredentials() {
        return new LorneException(ErrorCode.UNAUTHORIZED, "Invalid email or password");
    }
}
