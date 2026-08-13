package com.lorne.platform.auth.internal.dto;

public record LogoutRequest(
        String refreshToken
) {
}
