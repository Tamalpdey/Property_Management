package com.lorne.platform.notification.internal.controller;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import com.lorne.platform.notification.internal.service.EmailTemplateService;
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

@SpringJUnitConfig(EmailTemplateAuthorizationTest.Config.class)
class EmailTemplateAuthorizationTest {
    @Autowired EmailTemplateController controller;
    private final JwtPrincipal principal = new JwtPrincipal(UUID.randomUUID(), UUID.randomUUID(), "user@example.com", "User", List.of(), List.of());

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE"})
    void portalRolesCanReadAllTemplates(String role) {
        authenticate(role);
        assertThatCode(() -> controller.invoiceTemplate(principal)).doesNotThrowAnyException();
        assertThatCode(() -> controller.workOrderCompletedTemplate(principal)).doesNotThrowAnyException();
        assertThatCode(() -> controller.quoteTemplate(principal)).doesNotThrowAnyException();
    }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "FINANCE"})
    void invoiceWritersCanSaveAndReset(String role) {
        authenticate(role);
        assertThatCode(() -> controller.updateInvoiceTemplate(principal, null)).doesNotThrowAnyException();
        assertThatCode(() -> controller.resetInvoiceTemplate(principal)).doesNotThrowAnyException();
    }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS"})
    void completionWritersCanSaveAndReset(String role) {
        authenticate(role);
        assertThatCode(() -> controller.updateWorkOrderCompletedTemplate(principal, null)).doesNotThrowAnyException();
        assertThatCode(() -> controller.resetWorkOrderCompletedTemplate(principal)).doesNotThrowAnyException();
    }

    @ParameterizedTest @ValueSource(strings = {"OPERATIONS", "FIELD_WORKER", "CUSTOMER"})
    void invoiceWritesRemainRestricted(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.updateInvoiceTemplate(principal, null)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.resetInvoiceTemplate(principal)).isInstanceOf(AccessDeniedException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"FINANCE", "FIELD_WORKER", "CUSTOMER"})
    void completionWritesRemainRestricted(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.updateWorkOrderCompletedTemplate(principal, null)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.resetWorkOrderCompletedTemplate(principal)).isInstanceOf(AccessDeniedException.class);
    }

    @ParameterizedTest @ValueSource(strings = {"FIELD_WORKER", "CUSTOMER", "SUPER_ADMIN"})
    void nonPortalRolesCannotReadTemplates(String role) {
        authenticate(role);
        assertThatThrownBy(() -> controller.invoiceTemplate(principal)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.workOrderCompletedTemplate(principal)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> controller.quoteTemplate(principal)).isInstanceOf(AccessDeniedException.class);
    }

    private void authenticate(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }

    @Configuration @EnableMethodSecurity
    static class Config {
        @Bean EmailTemplateService service() { return mock(EmailTemplateService.class); }
        @Bean EmailTemplateController controller(EmailTemplateService service) { return new EmailTemplateController(service); }
    }
}
