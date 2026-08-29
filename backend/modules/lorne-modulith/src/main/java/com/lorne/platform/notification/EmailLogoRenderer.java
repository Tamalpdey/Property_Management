package com.lorne.platform.notification;

import com.lorne.platform.document.DocumentStorageService;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class EmailLogoRenderer {
    private static final String TENANT_LOGO_MARKER = "/api/v1/tenant/settings/logo/";
    private static final String TENANT_LOGO_CONTENT_ID = "tenant-logo";

    private final DocumentStorageService documentStorageService;
    private final EmailAssetUrlResolver emailAssetUrlResolver;

    public EmailLogoRenderer(
            DocumentStorageService documentStorageService,
            EmailAssetUrlResolver emailAssetUrlResolver
    ) {
        this.documentStorageService = documentStorageService;
        this.emailAssetUrlResolver = emailAssetUrlResolver;
    }

    public RenderedLogo render(String logoUrl, String tenantName, String primaryColor) {
        var publicUrl = emailAssetUrlResolver.externallyReachableUrl(logoUrl);
        var documentId = logoDocumentId(logoUrl);
        if (documentId != null) {
            try {
                var logo = documentStorageService.tenantLogo(documentId);
                return new RenderedLogo(
                        logoImage("cid:" + TENANT_LOGO_CONTENT_ID, tenantName),
                        publicUrl == null ? "" : publicUrl,
                        List.of(new OutboundEmailInlineImage(TENANT_LOGO_CONTENT_ID, logo.bytes(), logo.contentType()))
                );
            } catch (RuntimeException ignored) {
                // Fall back to the public URL or initials block below.
            }
        }
        if (publicUrl != null && !publicUrl.isBlank()) {
            return new RenderedLogo(logoImage(publicUrl, tenantName), publicUrl, List.of());
        }
        return new RenderedLogo(initialsBlock(tenantName, primaryColor), "", List.of());
    }

    private UUID logoDocumentId(String logoUrl) {
        if (logoUrl == null || logoUrl.isBlank()) {
            return null;
        }
        var markerIndex = logoUrl.indexOf(TENANT_LOGO_MARKER);
        if (markerIndex < 0) {
            return null;
        }
        var id = logoUrl.substring(markerIndex + TENANT_LOGO_MARKER.length());
        var queryIndex = id.indexOf('?');
        if (queryIndex >= 0) {
            id = id.substring(0, queryIndex);
        }
        var slashIndex = id.indexOf('/');
        if (slashIndex >= 0) {
            id = id.substring(0, slashIndex);
        }
        try {
            return UUID.fromString(id);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private String logoImage(String source, String tenantName) {
        return "<img src=\"%s\" alt=\"%s logo\" style=\"display:block;max-width:128px;max-height:64px;border:1px solid #dbe4ee;border-radius:10px;padding:8px;background:#ffffff;\" />"
                .formatted(escapeHtml(source), escapeHtml(firstNonBlank(tenantName, "Company")));
    }

    private String initialsBlock(String tenantName, String primaryColor) {
        var initials = Arrays.stream(firstNonBlank(tenantName, "Property Services").split("\\s+"))
                .filter(part -> !part.isBlank())
                .limit(2)
                .map(part -> part.substring(0, 1).toUpperCase(java.util.Locale.ROOT))
                .reduce("", String::concat);
        return "<span style=\"display:inline-grid;place-items:center;width:58px;height:58px;border:1px solid #dbe4ee;border-radius:12px;background:#ffffff;color:%s;font-weight:800;font-size:18px;\">%s</span>"
                .formatted(escapeHtml(firstNonBlank(primaryColor, "#0f766e")), escapeHtml(initials.isBlank() ? "PS" : initials));
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return "";
    }

    private String escapeHtml(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    public record RenderedLogo(
            String htmlBlock,
            String publicUrl,
            List<OutboundEmailInlineImage> inlineImages
    ) {
    }
}
