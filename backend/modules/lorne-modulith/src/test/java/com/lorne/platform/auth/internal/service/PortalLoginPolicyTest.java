package com.lorne.platform.auth.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.auth.internal.service.PortalLoginPolicy.Portal;
import com.lorne.platform.shared.exception.LorneException;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

class PortalLoginPolicyTest {
    private static final UUID TENANT_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    private JdbcTemplate jdbcTemplate;
    private PortalLoginPolicy policy;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        policy = new PortalLoginPolicy(jdbcTemplate, new LornePublicUrlProperties(null, "maplepropertyservices.ca"));
    }

    @Test
    void resolvesTenantAndWorkerSubdomainsToTheDatabaseTenant() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(UUID.class), eq("prs"))).thenReturn(TENANT_ID);

        assertThat(policy.resolve("prs.app.maplepropertyservices.ca", "tenant-portal"))
                .isEqualTo(new PortalLoginPolicy.PortalAccess(Portal.TENANT, TENANT_ID));
        assertThat(policy.resolve("prs.worker.maplepropertyservices.ca", "worker-app"))
                .isEqualTo(new PortalLoginPolicy.PortalAccess(Portal.WORKER, TENANT_ID));
    }

    @Test
    void rejectsGenericAndMismatchedPortalHosts() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(UUID.class), eq("prs"))).thenReturn(TENANT_ID);

        assertThatThrownBy(() -> policy.resolve("app.maplepropertyservices.ca", "tenant-portal"))
                .isInstanceOf(LorneException.class)
                .hasMessageContaining("company-specific");
        assertThatThrownBy(() -> policy.resolve("prs.worker.maplepropertyservices.ca", "tenant-portal"))
                .isInstanceOf(LorneException.class)
                .hasMessageContaining("does not match");
    }

    @Test
    void rejectsUnknownTenantAndTenantIdMismatch() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(UUID.class), eq("missing")))
                .thenThrow(new EmptyResultDataAccessException(1));
        assertThatThrownBy(() -> policy.resolve("missing.app.maplepropertyservices.ca", "tenant-portal"))
                .isInstanceOf(LorneException.class)
                .hasMessageContaining("not active");

        var access = new PortalLoginPolicy.PortalAccess(Portal.TENANT, TENANT_ID);
        assertThatThrownBy(() -> policy.requireRequestedTenant(access, UUID.randomUUID()))
                .isInstanceOf(LorneException.class)
                .hasMessageContaining("does not match");
    }

    @Test
    void keepsLocalDevelopmentPortalsAvailable() {
        assertThat(policy.resolve("localhost:4500", "tenant-portal").portal()).isEqualTo(Portal.TENANT);
        assertThat(policy.resolve("localhost:4502", "worker-app").portal()).isEqualTo(Portal.WORKER);
        verifyNoInteractions(jdbcTemplate);
    }
}
