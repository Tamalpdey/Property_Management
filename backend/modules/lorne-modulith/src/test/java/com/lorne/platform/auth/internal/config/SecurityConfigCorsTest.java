package com.lorne.platform.auth.internal.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class SecurityConfigCorsTest {

    @Test
    void allowsConfiguredTenantPortalOriginPatterns() {
        var securityConfig = new SecurityConfig(
                null,
                "http://localhost:4500,https://app.maplepropertyservices.ca",
                "https://*.app.maplepropertyservices.ca,https://*.worker.maplepropertyservices.ca"
        );
        var request = new MockHttpServletRequest("OPTIONS", "/api/v1/auth/login");
        var cors = securityConfig.corsConfigurationSource().getCorsConfiguration(request);

        assertThat(cors).isNotNull();
        assertThat(cors.checkOrigin("https://prs.app.maplepropertyservices.ca"))
                .isEqualTo("https://prs.app.maplepropertyservices.ca");
        assertThat(cors.checkOrigin("https://prs.worker.maplepropertyservices.ca"))
                .isEqualTo("https://prs.worker.maplepropertyservices.ca");
        assertThat(cors.checkOrigin("https://prs.app.example.com")).isNull();
        assertThat(cors.checkOrigin("https://app.maplepropertyservices.ca"))
                .isEqualTo("https://app.maplepropertyservices.ca");
    }
}
