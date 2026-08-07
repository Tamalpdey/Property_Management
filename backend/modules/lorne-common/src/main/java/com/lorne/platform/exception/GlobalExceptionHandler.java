package com.lorne.platform.shared.exception;

import com.lorne.platform.shared.response.ApiError;
import com.lorne.platform.shared.response.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(LorneException.class)
    ResponseEntity<ApiResponse<Void>> handleLorneException(LorneException exception) {
        if (exception.errorCode() == ErrorCode.INTERNAL_ERROR) {
            log.error("lorne_exception code={} message={}", exception.errorCode(), exception.getMessage(), exception);
        } else {
            log.warn("lorne_exception code={} message={}", exception.errorCode(), exception.getMessage());
        }
        HttpStatus status = switch (exception.errorCode()) {
            case BAD_REQUEST, BUSINESS_RULE_VIOLATION, DUPLICATE_RESOURCE -> HttpStatus.BAD_REQUEST;
            case UNAUTHORIZED -> HttpStatus.UNAUTHORIZED;
            case FORBIDDEN -> HttpStatus.FORBIDDEN;
            case NOT_FOUND -> HttpStatus.NOT_FOUND;
            case INTERNAL_ERROR -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return ResponseEntity.status(status)
                .body(ApiResponse.fail(ApiError.of(exception.errorCode().name(), exception.getMessage())));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ApiResponse<Void>> handleAccessDenied(AccessDeniedException exception) {
        log.warn("access_denied message={}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.fail(ApiError.of(ErrorCode.FORBIDDEN.name(), "Access denied")));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException exception) {
        var fields = exception.getBindingResult().getFieldErrors().stream()
                .map(error -> new ApiError.FieldViolation(error.getField(), error.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest()
                .body(ApiResponse.fail(new ApiError(ErrorCode.BAD_REQUEST.name(), "Validation failed", fields)));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiResponse<Void>> handleConstraintViolation(ConstraintViolationException exception) {
        return ResponseEntity.badRequest()
                .body(ApiResponse.fail(ApiError.of(ErrorCode.BAD_REQUEST.name(), exception.getMessage())));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ApiResponse<Void>> handleUnexpected(Exception exception) {
        log.error("unexpected_exception type={} message={}", exception.getClass().getName(), exception.getMessage(), exception);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.fail(ApiError.of(ErrorCode.INTERNAL_ERROR.name(), "Unexpected server error")));
    }
}
