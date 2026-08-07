package com.lorne.platform.auth.internal.security;

import com.lorne.platform.shared.tenant.TenantContext;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(JwtAuthenticationFilter.class);
    private static final String BEARER_PREFIX = "Bearer ";

    private final TokenProvider tokenProvider;

    public JwtAuthenticationFilter(TokenProvider tokenProvider) {
        this.tokenProvider = tokenProvider;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        try {
            var token = extractBearerToken(request);
            if (token != null) {
                var principal = tokenProvider.parseAccessToken(token);
                if (principal.tenantId() != null) {
                    TenantContext.setTenantId(principal.tenantId());
                }

                var authorities = new java.util.ArrayList<SimpleGrantedAuthority>();
                authorities.addAll(principal.roles().stream()
                        .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                        .toList());
                authorities.addAll(principal.permissions().stream()
                        .map(permission -> new SimpleGrantedAuthority("PERMISSION_" + permission))
                        .toList());

                var authentication = new UsernamePasswordAuthenticationToken(principal, token, authorities);
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }

            filterChain.doFilter(request, response);
        } catch (SecurityException exception) {
            SecurityContextHolder.clearContext();
            log.warn(
                    "jwt_authentication_failed method={} uri={} source={} remoteAddr={} reason={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    request.getHeader("X-Request-Source"),
                    request.getRemoteAddr(),
                    exception.getMessage()
            );
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Invalid or expired token\"}");
        } finally {
            TenantContext.clear();
        }
    }

    private String extractBearerToken(HttpServletRequest request) {
        var authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return null;
        }
        return authorization.substring(BEARER_PREFIX.length());
    }
}
