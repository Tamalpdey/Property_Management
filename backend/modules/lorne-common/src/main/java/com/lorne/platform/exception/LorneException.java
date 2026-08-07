package com.lorne.platform.shared.exception;

public class LorneException extends RuntimeException {
    private final ErrorCode errorCode;

    public LorneException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
    }

    public ErrorCode errorCode() {
        return errorCode;
    }
}
