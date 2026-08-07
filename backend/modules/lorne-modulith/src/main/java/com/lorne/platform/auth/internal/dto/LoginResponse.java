package com.lorne.platform.auth.internal.dto;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresInSeconds,
        CurrentUserResponse user
) {
}
