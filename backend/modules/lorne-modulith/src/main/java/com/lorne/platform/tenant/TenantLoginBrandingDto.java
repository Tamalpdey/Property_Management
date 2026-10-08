package com.lorne.platform.tenant;

import java.util.UUID;

public record TenantLoginBrandingDto(
        UUID tenantId,
        String portalSubdomain,
        String organizationName,
        String websiteUrl,
        String logoUrl,
        String themePrimaryColor,
        String themeAccentColor,
        String themeNavigationColor,
        String themePageBackgroundColor,
        String themeRadius,
        String loginStyle,
        String loginHeadline,
        String loginMessage,
        String loginBackgroundPattern,
        boolean loginShowPreview
) {
}
