package com.lorne.platform.auth.internal.dto;

import java.util.List;
import java.util.UUID;

public record TenantRecipientDto(UUID id, String displayName, String email, String status, List<String> roles) {
}
