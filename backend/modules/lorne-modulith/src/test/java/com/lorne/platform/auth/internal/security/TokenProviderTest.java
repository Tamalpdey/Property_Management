package com.lorne.platform.auth.internal.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class TokenProviderTest {
    @Test
    void generatesAndParsesAccessTokenWithTenantRolesAndPermissions() {
        var tokenProvider = new TokenProvider();
        ReflectionTestUtils.setField(
                tokenProvider,
                "jwtSecret",
                "test-secret-for-lorne-jwt-that-is-long-enough-for-hs512-signing-and-validation"
        );
        ReflectionTestUtils.setField(tokenProvider, "accessTokenExpirationMs", 3_600_000L);

        var userId = UUID.randomUUID();
        var tenantId = UUID.randomUUID();
        var user = new CurrentUserResponse(
                userId,
                tenantId,
                "Field Worker",
                "worker@example.com",
                List.of("FIELD_WORKER"),
                List.of("FIELD_WORK", "UPLOAD_JOB_PHOTOS")
        );

        var token = tokenProvider.generateAccessToken(user);
        var principal = tokenProvider.parseAccessToken(token);

        assertThat(principal.userId()).isEqualTo(userId);
        assertThat(principal.tenantId()).isEqualTo(tenantId);
        assertThat(principal.email()).isEqualTo("worker@example.com");
        assertThat(principal.displayName()).isEqualTo("Field Worker");
        assertThat(principal.roles()).containsExactly("FIELD_WORKER");
        assertThat(principal.permissions()).containsExactly("FIELD_WORK", "UPLOAD_JOB_PHOTOS");
    }
}
