package com.lorne.platform;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lorne.public-urls")
public record LornePublicUrlProperties(
        String tenantPortal,
        String rootDomain
) {
}
