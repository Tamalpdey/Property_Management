package com.lorne.platform.support.internal.controller;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.*;
import com.lorne.platform.support.internal.service.SupportTicketService;
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

@SpringJUnitConfig(SupportTicketAuthorizationTest.Config.class)
class SupportTicketAuthorizationTest {
    @Autowired TenantSupportTicketController tenant;
    @Autowired PlatformSupportTicketController platform;
    @Autowired SupportTicketService service;
    private final UUID tenantId = UUID.randomUUID();
    private final UUID userId = UUID.randomUUID();
    private final UUID ticketId = UUID.randomUUID();
    private final JwtPrincipal principal = new JwtPrincipal(userId, tenantId, "user@example.com", "Portal User", List.of(), List.of());

    @AfterEach void clear() { SecurityContextHolder.clearContext(); org.mockito.Mockito.reset(service); }

    @ParameterizedTest @ValueSource(strings = {"TENANT_ADMIN", "OPERATIONS", "FINANCE"})
    void portalRolesCanUseOnlyTheirScopedTicketEndpoints(String role) {
        authenticate(role);
        assertThatCode(() -> tenant.list(principal, null, null, null, 0, 25)).doesNotThrowAnyException();
        verify(service).list(tenantId, null, null, null, 0, 25);
        tenant.detail(principal, ticketId);
        verify(service).detail(tenantId, ticketId, false);
        tenant.reply(principal, ticketId, new Reply("Tenant reply"));
        verify(service).reply(tenantId, userId, ticketId, "Tenant reply", false, false);
        tenant.close(principal, ticketId, new Close(3));
        verify(service).close(tenantId, userId, ticketId, 3);
        assertPlatformDenied();
    }

    @ParameterizedTest @ValueSource(strings = {"FIELD_WORKER", "CUSTOMER", "SUPER_ADMIN"})
    void nonPortalRolesCannotUseTenantEndpoints(String role) {
        authenticate(role);
        assertThatThrownBy(() -> tenant.list(principal, null, null, null, 0, 25)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tenant.detail(principal, ticketId)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tenant.create(principal, new Create("Subject", "Details", "OTHER", "NORMAL"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tenant.reply(principal, ticketId, new Reply("Reply"))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> tenant.close(principal, ticketId, new Close(1))).isInstanceOf(AccessDeniedException.class);
    }

    @Test void platformAdminCanManageTicketsAndPrivateNotes() {
        authenticate("SUPER_ADMIN");
        assertThatCode(() -> platform.list(null, null, null, null, 0, 25)).doesNotThrowAnyException();
        platform.agents();
        platform.detail(ticketId);
        platform.update(principal, ticketId, new Update("RESOLVED", "HIGH", userId, 0));
        platform.reply(principal, ticketId, new AdminReply("Private note", true));
        verify(service).reply(null, userId, ticketId, "Private note", true, true);
    }

    @Test void tenantListRejectsMissingScopeInsteadOfListingEveryTenant() {
        authenticate("TENANT_ADMIN");
        var unscoped = new JwtPrincipal(userId, null, "user@example.com", "Portal User", List.of(), List.of());
        assertThatThrownBy(() -> tenant.list(unscoped, null, null, null, 0, 25)).isInstanceOf(AccessDeniedException.class);
    }

    private void assertPlatformDenied() {
        assertThatThrownBy(() -> platform.list(null, null, null, null, 0, 25)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> platform.detail(ticketId)).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> platform.agents()).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> platform.update(principal, ticketId, new Update("OPEN", "NORMAL", null, 0))).isInstanceOf(AccessDeniedException.class);
        assertThatThrownBy(() -> platform.reply(principal, ticketId, new AdminReply("Private", true))).isInstanceOf(AccessDeniedException.class);
    }
    private void authenticate(String role) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(principal, null, List.of(new SimpleGrantedAuthority("ROLE_" + role))));
    }
    @Configuration @EnableMethodSecurity static class Config {
        @Bean SupportTicketService service() { return mock(SupportTicketService.class); }
        @Bean TenantSupportTicketController tenant(SupportTicketService service) { return new TenantSupportTicketController(service); }
        @Bean PlatformSupportTicketController platform(SupportTicketService service) { return new PlatformSupportTicketController(service); }
    }
}
