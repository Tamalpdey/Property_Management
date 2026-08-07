package com.lorne.platform.document;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "lorne.storage")
public record DocumentStorageProperties(
        String provider,
        String bucket,
        String endpoint,
        String region,
        String accessKeyId,
        String secretAccessKey,
        int uploadExpiresSeconds,
        long maxImageBytes
) {
    public String provider() {
        return provider == null || provider.isBlank() ? "r2" : provider;
    }

    public String region() {
        return region == null || region.isBlank() ? "auto" : region;
    }

    public int uploadExpiresSeconds() {
        return uploadExpiresSeconds <= 0 ? 900 : uploadExpiresSeconds;
    }

    public long maxImageBytes() {
        return maxImageBytes <= 0 ? 10 * 1024 * 1024 : maxImageBytes;
    }
}
