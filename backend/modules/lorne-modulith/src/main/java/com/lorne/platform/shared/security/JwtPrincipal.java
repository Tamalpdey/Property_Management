package com.lorne.platform.shared.security;

import java.util.List;
import java.util.UUID;

public record JwtPrincipal(
        UUID userId,
        UUID tenantId,
        String email,
        String displayName,
        List<String> roles,
        List<String> permissions
) {
}
