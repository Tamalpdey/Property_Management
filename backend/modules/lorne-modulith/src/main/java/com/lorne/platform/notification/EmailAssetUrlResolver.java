package com.lorne.platform.notification;

import com.lorne.platform.LornePublicUrlProperties;
import org.springframework.stereotype.Component;

@Component
public class EmailAssetUrlResolver {
    private final LornePublicUrlProperties publicUrlProperties;

    public EmailAssetUrlResolver(LornePublicUrlProperties publicUrlProperties) {
        this.publicUrlProperties = publicUrlProperties;
    }

    public String externallyReachableUrl(String value) {
        var url = firstNonBlank(value);
        if (url == null) {
            return null;
        }
        var lower = url.toLowerCase(java.util.Locale.ROOT);
        if (lower.startsWith("https://") || lower.startsWith("http://")) {
            return url;
        }
        if (url.startsWith("/")) {
            var baseUrl = firstNonBlank(publicUrlProperties.tenantPortal());
            return baseUrl == null ? null : baseUrl.replaceAll("/+$", "") + url;
        }
        return null;
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
