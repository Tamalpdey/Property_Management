package com.lorne.platform.shared.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class ApiRequestLoggingFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(ApiRequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        var startedAt = Instant.now();
        try {
            filterChain.doFilter(request, response);
        } finally {
            if (request.getRequestURI().startsWith("/api/")) {
                log.info(
                        "api_request method={} uri={} status={} durationMs={} source={} origin={} remoteAddr={} userAgent={}",
                        request.getMethod(),
                        request.getRequestURI(),
                        response.getStatus(),
                        Duration.between(startedAt, Instant.now()).toMillis(),
                        headerOrDash(request, "X-Request-Source"),
                        headerOrDash(request, "Origin"),
                        request.getRemoteAddr(),
                        headerOrDash(request, "User-Agent")
                );
            }
        }
    }

    private String headerOrDash(HttpServletRequest request, String name) {
        var value = request.getHeader(name);
        return value == null || value.isBlank() ? "-" : value;
    }
}
