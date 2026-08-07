package com.lorne.platform.shared.response;

import java.time.Instant;

public record ApiResponse<T>(
        boolean success,
        T data,
        ApiError error,
        Instant timestamp
) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(true, data, null, Instant.now());
    }

    public static ApiResponse<Void> ok() {
        return ok(null);
    }

    public static ApiResponse<Void> fail(ApiError error) {
        return new ApiResponse<>(false, null, error, Instant.now());
    }
}
