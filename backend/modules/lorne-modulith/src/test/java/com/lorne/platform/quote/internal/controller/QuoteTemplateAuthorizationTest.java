package com.lorne.platform.quote.internal.controller;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.*;
import com.lorne.platform.quote.internal.service.QuoteTemplateService;
import com.lorne.platform.shared.security.JwtPrincipal;
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

@SpringJUnitConfig(QuoteTemplateAuthorizationTest.Config.class)
class QuoteTemplateAuthorizationTest {
    @Autowired QuoteTemplateController controller;
    @Autowired QuoteTemplateService service;
    private final UUID tenant = UUID.randomUUID();
    private final UUID user = UUID.randomUUID();
    private final JwtPrincipal principal = new JwtPrincipal(user, tenant, "user@example.com", "User", List.of(), List.of());

    @AfterEach void clear() { SecurityContextHolder.clearContext(); org.mockito.Mockito.reset(service); }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE"})
    void tenantRolesCanReadOnlyTheirAssignedTemplates(String role) {
        authenticate(role);
        controller.available(principal);
        verify(service).available(tenant);
        assertConfigurationDenied();
    }

    @ParameterizedTest @ValueSource(strings = {"FIELD_WORKER", "CUSTOMER"})
    void workersAndClientsCannotReadOrConfigureTemplates(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.available(principal)).isInstanceOf(AccessDeniedException.class);
        assertConfigurationDenied();
    }

    @Test void superAdminCanConfigureAndAssignButNotUseTenantEndpoints() {
        authenticate("SUPER_ADMIN");
        controller.catalog();
        controller.assignment(tenant);
        var defaults = new Configure("Estimate", "Notes", "Terms", 1);
        var assignment = new Assign(List.of("TOTAL_PRICE"), "TOTAL_PRICE");
        controller.configure(principal, "TOTAL_PRICE", defaults);
        controller.assign(principal, tenant, assignment);
        verify(service).configure(user, "TOTAL_PRICE", defaults);
        verify(service).assign(tenant, user, assignment);
        assertThatThrownBy(() -> controller.available(principal)).isInstanceOf(AccessDeniedException.class);
    }

    private void assertConfigurationDenied() {
        assertThatThrownBy(() -> controller.catalog()).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.assignment(tenant)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.configure(principal, "ITEMIZED", new Configure("Estimate", null, null, 0))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.assign(principal, tenant, new Assign(List.of("ITEMIZED"), "ITEMIZED"))).isInstanceOf(AccessDeniedException.class);
    }

    private void authenticate(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null,
                List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    @Configuration @EnableMethodSecurity static class Config {
        @Bean QuoteTemplateService service() { return mock(QuoteTemplateService.class); }
        @Bean QuoteTemplateController controller(QuoteTemplateService service) { return new QuoteTemplateController(service); }
    }
}
