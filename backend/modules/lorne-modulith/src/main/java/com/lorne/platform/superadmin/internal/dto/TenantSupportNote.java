package com.lorne.platform.superadmin.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record TenantSupportNote(UUID id, String note, String actorName, Instant createdAt) {
    public record Request(@NotBlank @Size(max = 4000) String note) { }
}
