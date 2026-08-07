package com.lorne.platform.document;

public record PhotoUploadRequest(
        String fileName,
        String contentType,
        Long byteSize,
        String photoType,
        String documentType
) {
}
