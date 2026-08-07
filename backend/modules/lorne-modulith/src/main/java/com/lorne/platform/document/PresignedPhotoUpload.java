package com.lorne.platform.document;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record PresignedPhotoUpload(
        UUID documentId,
        String bucket,
        String objectKey,
        String uploadUrl,
        Instant expiresAt,
        Map<String, String> headers
) {
}
