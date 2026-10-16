package com.lorne.platform.shared.exception;

public class ConflictException extends LorneException {
    public ConflictException(String message) { super(ErrorCode.CONFLICT, message); }
}
