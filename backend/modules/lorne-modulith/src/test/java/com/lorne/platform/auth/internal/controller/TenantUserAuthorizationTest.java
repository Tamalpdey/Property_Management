package com.lorne.platform.auth.internal.controller;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.lorne.platform.auth.internal.service.TenantUserManagementService;
import com.lorne.platform.shared.security.JwtPrincipal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(TenantUserAuthorizationTest.Config.class)
class TenantUserAuthorizationTest {
    @Autowired TenantUserManagementController controller;
    @Autowired SuperAdminTenantAccessController supportController;
    private final JwtPrincipal principal = new JwtPrincipal(UUID.randomUUID(), UUID.randomUUID(), "user@example.com", "User", List.of(), List.of());

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE"})
    void portalRolesCanReadCatalogAndRecipients(String role) {
        authenticate(role);
        assertThatCode(() -> controller.roles()).doesNotThrowAnyException();
        assertThatCode(() -> controller.recipients(principal)).doesNotThrowAnyException();
    }

    @ParameterizedTest @ValueSource(strings = {"OPERATIONS", "FINANCE", "FIELD_WORKER", "CUSTOMER", "SUPER_ADMIN"})
    void nonTenantAdminsCannotReadOrManageAdministrativeUsers(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.list(principal)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.create(principal, null)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.update(principal, UUID.randomUUID(), null)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.activate(principal, UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.deactivate(principal, UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.delete(principal, UUID.randomUUID())).isInstanceOf(AccessDeniedException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"FIELD_WORKER", "CUSTOMER", "SUPER_ADMIN"})
    void otherRolesCannotReadPortalCatalog(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.roles()).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.recipients(principal)).isInstanceOf(AccessDeniedException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE", "FIELD_WORKER", "CUSTOMER"})
    void tenantRolesCannotUsePlatformRecovery(String role) {
        authenticate(role);
        assertThatThrownBy(() -> supportController.list(principal.tenantId())).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> supportController.update(principal, principal.tenantId(), UUID.randomUUID(), null)).isInstanceOf(AccessDeniedException.class);
    }

    @org.junit.jupiter.api.Test
    void superAdminCanUseSupportEndpoints() {
        authenticate("SUPER_ADMIN");
        assertThatCode(() -> supportController.list(principal.tenantId())).doesNotThrowAnyException();
        assertThatCode(() -> supportController.update(principal, principal.tenantId(), UUID.randomUUID(), null)).doesNotThrowAnyException();
    }

    private void authenticate(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Configuration @EnableMethodSecurity
    static class Config {
        @Bean TenantUserManagementService service() { return mock(TenantUserManagementService.class); }
        @Bean TenantUserManagementController controller(TenantUserManagementService service) { return new TenantUserManagementController(service); }
        @Bean SuperAdminTenantAccessController supportController(TenantUserManagementService service) { return new SuperAdminTenantAccessController(service); }
    }
}
