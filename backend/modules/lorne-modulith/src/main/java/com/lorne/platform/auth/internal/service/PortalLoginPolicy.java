package com.lorne.platform.auth.internal.service;

import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.shared.exception.ErrorCode;
import com.lorne.platform.shared.exception.LorneException;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class PortalLoginPolicy {
    private static final Pattern PORTAL_SUBDOMAIN = Pattern.compile("^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$");

    private final JdbcTemplate jdbcTemplate;
    private final String rootDomain;

    public PortalLoginPolicy(JdbcTemplate jdbcTemplate, LornePublicUrlProperties publicUrlProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.rootDomain = normalize(publicUrlProperties.rootDomain());
    }

    public PortalAccess resolve(String requestHost, String requestSource) {
        var host = normalizeHost(requestHost);
        var source = normalize(requestSource);
        if (isLocalHost(host)) {
            return new PortalAccess(localPortal(source), null);
        }
        if (rootDomain.isBlank()) {
            throw forbidden("Tenant login routing is not configured.");
        }

        var adminHost = "admin." + rootDomain;
        if (host.equals(adminHost)) {
            requireSource(source, "admin-portal");
            return new PortalAccess(Portal.ADMIN, null);
        }

        var tenant = tenantAccess(host, ".app." + rootDomain, Portal.TENANT, "tenant-portal");
        if (tenant != null) {
            requireSource(source, tenant.expectedSource());
            return new PortalAccess(tenant.portal(), tenant.tenantId());
        }

        var worker = tenantAccess(host, ".worker." + rootDomain, Portal.WORKER, "worker-app");
        if (worker != null) {
            requireSource(source, worker.expectedSource());
            return new PortalAccess(worker.portal(), worker.tenantId());
        }

        throw forbidden("Use the company-specific sign-in address provided by your administrator.");
    }

    public void requireRequestedTenant(PortalAccess access, UUID requestedTenantId) {
        if (access.tenantId() != null && !access.tenantId().equals(requestedTenantId)) {
            throw forbidden("This sign-in address does not match the requested tenant.");
        }
    }

    private TenantAccess tenantAccess(String host, String suffix, Portal portal, String expectedSource) {
        if (!host.endsWith(suffix)) {
            return null;
        }
        var subdomain = host.substring(0, host.length() - suffix.length());
        if (!PORTAL_SUBDOMAIN.matcher(subdomain).matches()) {
            throw forbidden("The tenant sign-in address is invalid.");
        }
        try {
            var tenantId = jdbcTemplate.queryForObject("""
                    SELECT id
                    FROM tenants
                    WHERE lower(portal_subdomain) = ?
                      AND status IN ('TRIAL'::tenant_status, 'ACTIVE'::tenant_status, 'PAST_DUE'::tenant_status)
                    LIMIT 1
                    """, UUID.class, subdomain);
            if (tenantId == null) {
                throw forbidden("The tenant sign-in address is not active.");
            }
            return new TenantAccess(portal, tenantId, expectedSource);
        } catch (EmptyResultDataAccessException exception) {
            throw forbidden("The tenant sign-in address is not active.");
        }
    }

    private Portal localPortal(String source) {
        return switch (source) {
            case "admin-portal" -> Portal.ADMIN;
            case "worker-app" -> Portal.WORKER;
            case "tenant-portal" -> Portal.TENANT;
            default -> throw forbidden("The login client is not recognized.");
        };
    }

    private void requireSource(String actual, String expected) {
        if (!expected.equals(actual)) {
            throw forbidden("This sign-in page does not match the requested portal.");
        }
    }

    private boolean isLocalHost(String host) {
        return host.equals("localhost") || host.equals("127.0.0.1") || host.endsWith(".localhost");
    }

    private String normalizeHost(String value) {
        var normalized = normalize(value);
        if (normalized.startsWith("[")) {
            var closingBracket = normalized.indexOf(']');
            return closingBracket >= 0 ? normalized.substring(0, closingBracket + 1) : normalized;
        }
        var portSeparator = normalized.indexOf(':');
        return portSeparator >= 0 ? normalized.substring(0, portSeparator) : normalized;
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private LorneException forbidden(String message) {
        return new LorneException(ErrorCode.FORBIDDEN, message);
    }

    public enum Portal {
        ADMIN,
        TENANT,
        WORKER
    }

    public record PortalAccess(Portal portal, UUID tenantId) {
    }

    private record TenantAccess(Portal portal, UUID tenantId, String expectedSource) {
    }
}
