package com.lorne.platform.tenant.internal.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.tenant.TenantSettingsView;
import com.lorne.platform.tenant.internal.dto.UpdateTenantSettingsRequest;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class TenantTimezoneSettingsTest {
    private final UUID tenant = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private AuditWriter audit;
    private TenantSettingsService service;
    @BeforeEach void setup() {
        jdbc = mock(JdbcTemplate.class);
        audit = mock(AuditWriter.class);
        service = spy(new TenantSettingsService(jdbc, audit));
        when(jdbc.queryForObject("SELECT timezone FROM tenants WHERE id = ?", String.class, tenant)).thenReturn("America/Toronto");
        when(jdbc.queryForObject("SELECT portal_subdomain FROM tenants WHERE id = ?", String.class, tenant)).thenReturn("prs");
        doReturn(mock(TenantSettingsView.class)).when(service).settings(tenant);
    }
    @Test void savesTimezoneOnTenantAndAuditsChange() throws Exception {
        service.update(tenant, actor, request("{\"timezone\":\"America/Vancouver\"}"));
        verify(jdbc).update("UPDATE tenants SET portal_subdomain = ?, timezone = ?, updated_by = ?, updated_at = now() WHERE id = ?", "prs", "America/Vancouver", actor, tenant);
        verify(audit).record(eq(tenant), eq(actor), eq("TENANT_TIMEZONE_UPDATED"), eq("TENANT"), eq(tenant), any());
    }
    @Test void omittedTimezonePreservesExistingValueForOlderClients() throws Exception {
        service.update(tenant, actor, request("{}"));
        verify(jdbc).update("UPDATE tenants SET portal_subdomain = ?, timezone = ?, updated_by = ?, updated_at = now() WHERE id = ?", "prs", "America/Toronto", actor, tenant);
        verify(audit, never()).record(eq(tenant), eq(actor), eq("TENANT_TIMEZONE_UPDATED"), any(), any(), any());
    }
    @Test void rejectsInvalidOrBlankTimezoneBeforeWriting() throws Exception {
        var invalid = request("{\"timezone\":\"not-a-timezone\"}");
        var blank = request("{\"timezone\":\" \"}");
        assertThatThrownBy(() -> service.update(tenant, actor, invalid)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.update(tenant, actor, blank)).isInstanceOf(BadRequestException.class);
        verify(jdbc, never()).update(eq("UPDATE tenants SET portal_subdomain = ?, timezone = ?, updated_by = ?, updated_at = now() WHERE id = ?"), any(), any(), any(), any());
    }
    private UpdateTenantSettingsRequest request(String json) throws Exception { return new ObjectMapper().readValue(json, UpdateTenantSettingsRequest.class); }
}
