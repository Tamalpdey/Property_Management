package com.lorne.platform.shared.response;

import java.util.List;

public record ApiError(
        String code,
        String message,
        List<FieldViolation> fields
) {
    public static ApiError of(String code, String message) {
        return new ApiError(code, message, List.of());
    }

    public record FieldViolation(String field, String message) {
    }
}
