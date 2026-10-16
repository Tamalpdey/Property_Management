package com.lorne.platform.superadmin.internal.controller;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.superadmin.internal.dto.TenantSupportNote;
import com.lorne.platform.superadmin.internal.dto.SetTenantAccessRequest;
import com.lorne.platform.superadmin.internal.service.PlatformSupportService;
import com.lorne.platform.superadmin.internal.service.TenantOnboardingService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
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

@SpringJUnitConfig(SuperAdminSupportAuthorizationTest.Config.class)
class SuperAdminSupportAuthorizationTest {
    @Autowired SuperAdminSupportController controller;
    @Autowired SuperAdminTenantController tenantController;
    private final UUID tenant = UUID.randomUUID();
    private final JwtPrincipal principal = new JwtPrincipal(UUID.randomUUID(), null, "super@example.com", "Super Admin", List.of("SUPER_ADMIN"), List.of());

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE", "FIELD_WORKER", "CUSTOMER"})
    void supportDataAndMutationsAreNotAvailableToTenantRoles(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.health(tenant)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.operations(tenant)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tenantController.setAccess(principal, tenant, new SetTenantAccessRequest(false, "Verified support request"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.notes(tenant)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.addNote(tenant, principal, new TenantSupportNote.Request("Private support note"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.audit(null, null, null, null, 0, 25)).isInstanceOf(AccessDeniedException.class);
    }

    @Test void superAdminCanAccessSupportData() {
        authenticate("SUPER_ADMIN");
        assertThatCode(() -> controller.health(tenant)).doesNotThrowAnyException();
        assertThatCode(() -> controller.operations(tenant)).doesNotThrowAnyException();
        assertThatCode(() -> tenantController.setAccess(principal, tenant, new SetTenantAccessRequest(false, "Verified support request"))).doesNotThrowAnyException();
        assertThatCode(() -> controller.notes(tenant)).doesNotThrowAnyException();
        assertThatCode(() -> controller.addNote(tenant, principal, new TenantSupportNote.Request("Private note"))).doesNotThrowAnyException();
        assertThatCode(() -> controller.audit(null, null, null, null, 0, 25)).doesNotThrowAnyException();
    }

    private void authenticate(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    @Configuration @EnableMethodSecurity static class Config {
        @Bean PlatformSupportService service() { return mock(PlatformSupportService.class); }
        @Bean SuperAdminSupportController controller(PlatformSupportService service) { return new SuperAdminSupportController(service); }
        @Bean TenantOnboardingService tenantService() { return mock(TenantOnboardingService.class); }
        @Bean SuperAdminTenantController tenantController(TenantOnboardingService service) { return new SuperAdminTenantController(service); }
    }
}
