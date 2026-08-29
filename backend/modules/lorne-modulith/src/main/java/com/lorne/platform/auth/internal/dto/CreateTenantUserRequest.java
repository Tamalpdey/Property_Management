package com.lorne.platform.auth.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.UUID;

public record CreateTenantUserRequest(
        @NotBlank String displayName,
        String profilePhotoUrl,
        @Email @NotBlank String email,
        String phone,
        @NotBlank String temporaryPassword,
        List<String> roles,
        UUID workerId
) {
}
