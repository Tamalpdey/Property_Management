package com.lorne.platform.shared.exception;

public class DuplicateResourceException extends LorneException {
    public DuplicateResourceException(String message) {
        super(ErrorCode.DUPLICATE_RESOURCE, message);
    }
}
