package com.lorne.platform.auth.internal.dto;

public record LoginResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresInSeconds,
        long refreshExpiresInSeconds,
        CurrentUserResponse user
) {
}
