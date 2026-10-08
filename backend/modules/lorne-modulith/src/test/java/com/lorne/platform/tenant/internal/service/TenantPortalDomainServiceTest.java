package com.lorne.platform.tenant.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.lorne.platform.audit.AuditWriter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantPortalDomainServiceTest {
    private JdbcTemplate jdbcTemplate;
    private TenantSettingsService service;

    @BeforeEach
    void setUp() {
        jdbcTemplate = mock(JdbcTemplate.class);
        service = new TenantSettingsService(jdbcTemplate, mock(AuditWriter.class));
    }

    @Test
    void allowsKnownTenantAppAndWorkerHosts() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(Integer.class), eq("acme"))).thenReturn(1);

        assertThat(service.portalDomainAllowed("acme.app.maplepropertyservices.ca", "maplepropertyservices.ca")).isTrue();
        assertThat(service.portalDomainAllowed("acme.worker.maplepropertyservices.ca", "maplepropertyservices.ca")).isTrue();
    }

    @Test
    void rejectsUnknownOrMalformedHostsBeforeCertificateIssuance() {
        assertThat(service.portalDomainAllowed("app.maplepropertyservices.ca", "maplepropertyservices.ca")).isFalse();
        assertThat(service.portalDomainAllowed("acme.example.com", "maplepropertyservices.ca")).isFalse();
        assertThat(service.portalDomainAllowed("bad.name.app.maplepropertyservices.ca", "maplepropertyservices.ca")).isFalse();

        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void rejectsTenantHostWhenTenantIsNotEligible() {
        when(jdbcTemplate.queryForObject(any(String.class), eq(Integer.class), eq("suspended"))).thenReturn(0);

        assertThat(service.portalDomainAllowed("suspended.app.maplepropertyservices.ca", "maplepropertyservices.ca")).isFalse();
    }
}
