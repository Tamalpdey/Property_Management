package com.lorne.platform.shared.exception;

public class ResourceNotFoundException extends LorneException {
    public ResourceNotFoundException(String message) {
        super(ErrorCode.NOT_FOUND, message);
    }
}
