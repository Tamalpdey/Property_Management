package com.lorne.platform.auth.internal.dto;

import java.util.List;
import java.util.UUID;

public record CurrentUserResponse(
        UUID id,
        UUID tenantId,
        String displayName,
        String email,
        List<String> roles,
        List<String> permissions
) {
}
