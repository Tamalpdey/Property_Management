package com.lorne.platform.shared.exception;

public class BadRequestException extends LorneException {
    public BadRequestException(String message) {
        super(ErrorCode.BAD_REQUEST, message);
    }
}
