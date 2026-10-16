package com.lorne.platform.auth.internal.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import com.lorne.platform.shared.security.JwtPrincipal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import jakarta.servlet.FilterChain;

class JwtTenantStatusTest {
    @Test
    void blocksOldAdminTokenAfterDemotion() throws Exception {
        assertTenantRoles(List.of("OPERATIONS"), 401);
    }

    @Test
    void blocksTokensForDisabledOrRemovedTenantUsers() throws Exception {
        assertTenantRoles(List.of(), 401);
    }

    @Test
    void unchangedCurrentMembershipCanContinueUsingToken() throws Exception {
        assertTenantRoles(List.of("TENANT_ADMIN"), 200);
    }

    private void assertTenantRoles(List<String> currentRoles, int expectedStatus) throws Exception {
        var provider = mock(TokenProvider.class);
        var jdbc = mock(JdbcTemplate.class);
        var tenant = UUID.randomUUID();
        var user = UUID.randomUUID();
        when(provider.parseAccessToken("token")).thenReturn(new JwtPrincipal(user, tenant, "user@example.com", "User", List.of("TENANT_ADMIN"), List.of()));
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), eq(tenant))).thenReturn(true);
        when(jdbc.queryForList(any(String.class), eq(String.class), eq(tenant), eq(user))).thenReturn(currentRoles);
        var request = new MockHttpServletRequest("GET", "/api/v1/tenant/users");
        request.addHeader("Authorization", "Bearer token");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        try {
            new JwtAuthenticationFilter(provider, jdbc).doFilter(request, response, chain);
            assertThat(response.getStatus()).isEqualTo(expectedStatus);
            if (expectedStatus == 401) verifyNoInteractions(chain);
            else verify(chain).doFilter(request, response);
        } finally { SecurityContextHolder.clearContext(); }
    }

    @Test
    void blocksExistingTokensAfterTenantIsSuspended() throws Exception {
        var tokenProvider = mock(TokenProvider.class);
        var jdbc = mock(JdbcTemplate.class);
        var tenant = UUID.randomUUID();
        when(tokenProvider.parseAccessToken("token")).thenReturn(new JwtPrincipal(UUID.randomUUID(), tenant, "user@example.com", "User", List.of("TENANT_ADMIN"), List.of()));
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), eq(tenant))).thenReturn(false);
        var request = new MockHttpServletRequest("GET", "/api/v1/tenant/quotes");
        request.addHeader("Authorization", "Bearer token");
        var response = new MockHttpServletResponse();
        var chain = mock(FilterChain.class);
        new JwtAuthenticationFilter(tokenProvider, jdbc).doFilter(request, response, chain);
        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(chain);
    }

    @Test
    void superAdminTokenDoesNotRequireAnActiveTenant() throws Exception {
        var provider = mock(TokenProvider.class);
        var jdbc = mock(JdbcTemplate.class);
        when(provider.parseAccessToken("admin")).thenReturn(new JwtPrincipal(UUID.randomUUID(), null, "admin@example.com", "Admin", List.of("SUPER_ADMIN"), List.of()));
        var request = new MockHttpServletRequest("GET", "/api/v1/superadmin/tenants");
        request.addHeader("Authorization", "Bearer admin");
        var chain = mock(FilterChain.class);
        try {
            new JwtAuthenticationFilter(provider, jdbc).doFilter(request, new MockHttpServletResponse(), chain);
            verify(chain).doFilter(any(), any());
            verifyNoInteractions(jdbc);
        } finally { SecurityContextHolder.clearContext(); }
    }
}
