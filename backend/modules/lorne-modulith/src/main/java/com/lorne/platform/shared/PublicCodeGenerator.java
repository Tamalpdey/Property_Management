package com.lorne.platform.shared;

import java.util.Locale;
import java.util.UUID;

public final class PublicCodeGenerator {
    private PublicCodeGenerator() {
    }

    public static String ownerCode(UUID id) {
        return code("OWN", id);
    }

    public static String propertyCode(UUID id) {
        return code("PRP", id);
    }

    private static String code(String prefix, UUID id) {
        var compactId = id.toString().replace("-", "").toUpperCase(Locale.ROOT);
        return "%s-%s%s".formatted(prefix, compactId.substring(0, 5), compactId.substring(compactId.length() - 5));
    }
}
