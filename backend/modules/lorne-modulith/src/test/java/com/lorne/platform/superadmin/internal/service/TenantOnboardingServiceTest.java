package com.lorne.platform.superadmin.internal.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.DuplicateResourceException;
import com.lorne.platform.superadmin.internal.dto.CreateTenantOnboardingRequest;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

class TenantOnboardingServiceTest {
    private JdbcTemplate jdbcTemplate;
    private PasswordEncoder passwordEncoder;
    private AuditWriter auditWriter;
    private TenantOnboardingService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        passwordEncoder = mock(PasswordEncoder.class);
        auditWriter = mock(AuditWriter.class);
        service = new TenantOnboardingService(jdbcTemplate, passwordEncoder, auditWriter);
    }

    @Test
    void rejectsInvalidPortalSubdomainBeforeWritingAnything() {
        assertThatThrownBy(() -> service.create(UUID.randomUUID(), request("North Shore!", "TRIAL", "admin@example.com")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Portal subdomain");

        verifyNoInteractions(jdbcTemplate, passwordEncoder, auditWriter);
    }

    @Test
    void rejectsUnsupportedStartingStatusBeforeWritingAnything() {
        assertThatThrownBy(() -> service.create(UUID.randomUUID(), request("north-shore", "SUSPENDED", "admin@example.com")))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("trial or active");

        verifyNoInteractions(jdbcTemplate, passwordEncoder, auditWriter);
    }

    @Test
    void rejectsAdministratorEmailThatAlreadyHasAnIdentity() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(Integer.class), eq("admin@example.com"))).thenReturn(1);

        assertThatThrownBy(() -> service.create(UUID.randomUUID(), request("north-shore", "ACTIVE", "Admin@Example.com")))
                .isInstanceOf(DuplicateResourceException.class)
                .hasMessageContaining("already belongs");

        verifyNoInteractions(passwordEncoder, auditWriter);
    }

    private CreateTenantOnboardingRequest request(String subdomain, String status, String email) {
        return new CreateTenantOnboardingRequest(
                "North Shore Property Services Inc.", "North Shore", subdomain, "starter", status,
                "America/Toronto", "CA", "ON", "Tenant Admin", email, null, "Password123!",
                null, null, null, null, null, null, null, null,
                "#0f766e", "#2563eb", "#0f172a", "Welcome back", "Access your operations workspace."
        );
    }
}
