package com.lorne.platform.auth.internal.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.util.UUID;

public record LoginRequest(
        @Email @NotBlank String email,
        @NotBlank String password,
        UUID tenantId
) {
}
