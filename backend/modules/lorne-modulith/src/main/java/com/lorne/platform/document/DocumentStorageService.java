package com.lorne.platform.document;

import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.net.URI;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;

@Service
public class DocumentStorageService {
    private final JdbcTemplate jdbcTemplate;
    private final DocumentStorageProperties properties;

    public DocumentStorageService(JdbcTemplate jdbcTemplate, DocumentStorageProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    @Transactional
    public PresignedPhotoUpload createWorkOrderPhotoUpload(
            UUID tenantId,
            UUID actorUserId,
            UUID workOrderId,
        PhotoUploadRequest request
    ) {
        requireConfigured();
        var documentType = documentType(request.documentType());
        var contentType = contentType(request.contentType(), documentType);
        var byteSize = request.byteSize() == null ? 0 : request.byteSize();
        if (byteSize <= 0 || byteSize > properties.maxImageBytes()) {
            throw new BadRequestException(documentType.equals("PURCHASE_RECEIPT") ? "Receipt file size is not valid." : "Image size is not valid.");
        }
        var objectKey = objectKey(tenantId, workOrderId, request.fileName(), documentType);
        return createPresignedUpload(tenantId, actorUserId, "WORK_ORDER", workOrderId, objectKey, contentType, byteSize);
    }

    @Transactional
    public PresignedPhotoUpload createTenantLogoUpload(UUID tenantId, UUID actorUserId, PhotoUploadRequest request) {
        requireConfigured();
        var contentType = logoContentType(request.contentType());
        var byteSize = request.byteSize() == null ? 0 : request.byteSize();
        if (byteSize <= 0 || byteSize > properties.maxImageBytes()) {
            throw new BadRequestException("Logo file size is not valid.");
        }
        var objectKey = tenantLogoObjectKey(tenantId, request.fileName());
        return createPresignedUpload(tenantId, actorUserId, "TENANT_LOGO", tenantId, objectKey, contentType, byteSize);
    }

    @Transactional
    public PresignedPhotoUpload createUserProfilePhotoUpload(UUID tenantId, UUID actorUserId, PhotoUploadRequest request) {
        requireConfigured();
        var contentType = logoContentType(request.contentType());
        var byteSize = request.byteSize() == null ? 0 : request.byteSize();
        if (byteSize <= 0 || byteSize > properties.maxImageBytes()) {
            throw new BadRequestException("Profile photo file size is not valid.");
        }
        var objectKey = userProfilePhotoObjectKey(tenantId, actorUserId, request.fileName());
        return createPresignedUpload(tenantId, actorUserId, "USER_PROFILE_PHOTO", actorUserId, objectKey, contentType, byteSize);
    }

    public void requireWorkOrderDocument(UUID tenantId, UUID workOrderId, UUID documentId) {
        var exists = Boolean.TRUE.equals(jdbcTemplate.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM documents
                    WHERE tenant_id = ? AND id = ? AND owner_type = 'WORK_ORDER' AND owner_id = ?
                )
                """, Boolean.class, tenantId, documentId, workOrderId));
        if (!exists) {
            throw new BadRequestException("Uploaded document is not valid for this work order.");
        }
    }

    public String createReadUrl(String bucket, String objectKey) {
        requireConfigured();
        if (isBlank(bucket) || isBlank(objectKey)) {
            return "";
        }
        var request = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(properties.uploadExpiresSeconds()))
                .getObjectRequest(GetObjectRequest.builder()
                        .bucket(bucket)
                        .key(objectKey)
                        .build())
                .build();
        try (var presigner = presigner()) {
            return presigner.presignGetObject(request).url().toString();
        }
    }

    public String createTenantLogoReadUrl(UUID documentId) {
        var documents = jdbcTemplate.query("""
                SELECT bucket, object_key
                FROM documents
                WHERE id = ? AND owner_type = 'TENANT_LOGO'
                """, (rs, rowNum) -> new StoredDocument(
                rs.getString("bucket"),
                rs.getString("object_key")
        ), documentId);
        var document = documents.stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Tenant logo was not found."));
        return createReadUrl(document.bucket(), document.objectKey());
    }

    public String createUserProfilePhotoReadUrl(UUID documentId) {
        var documents = jdbcTemplate.query("""
                SELECT bucket, object_key
                FROM documents
                WHERE id = ? AND owner_type = 'USER_PROFILE_PHOTO'
                """, (rs, rowNum) -> new StoredDocument(
                rs.getString("bucket"),
                rs.getString("object_key")
        ), documentId);
        var document = documents.stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Profile photo was not found."));
        return createReadUrl(document.bucket(), document.objectKey());
    }

    public StoredLogo tenantLogo(UUID tenantId, UUID documentId) {
        requireConfigured();
        var documents = jdbcTemplate.query("""
                SELECT bucket, object_key, content_type
                FROM documents
                WHERE tenant_id = ? AND id = ? AND owner_type = 'TENANT_LOGO'
                """, (rs, rowNum) -> new StoredLogo(
                rs.getString("content_type"),
                objectBytes(rs.getString("bucket"), rs.getString("object_key"))
        ), tenantId, documentId);
        return documents.stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Tenant logo was not found."));
    }

    public StoredLogo tenantLogo(UUID documentId) {
        requireConfigured();
        var documents = jdbcTemplate.query("""
                SELECT bucket, object_key, content_type
                FROM documents
                WHERE id = ? AND owner_type = 'TENANT_LOGO'
                """, (rs, rowNum) -> new StoredLogo(
                rs.getString("content_type"),
                objectBytes(rs.getString("bucket"), rs.getString("object_key"))
        ), documentId);
        return documents.stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Tenant logo was not found."));
    }

    @Transactional
    public DeletedDocument deleteWorkOrderDocument(UUID tenantId, UUID workOrderId, UUID documentId) {
        requireConfigured();
        var documents = jdbcTemplate.query("""
                SELECT id, bucket, object_key
                FROM documents
                WHERE tenant_id = ? AND id = ? AND owner_type = 'WORK_ORDER' AND owner_id = ?
                """, (rs, rowNum) -> new DeletedDocument(
                rs.getObject("id", UUID.class),
                rs.getString("bucket"),
                rs.getString("object_key")
        ), tenantId, documentId, workOrderId);
        var document = documents.stream().findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("Uploaded evidence was not found."));

        deleteObject(document.bucket(), document.objectKey());
        jdbcTemplate.update("""
                DELETE FROM documents
                WHERE tenant_id = ? AND id = ? AND owner_type = 'WORK_ORDER' AND owner_id = ?
                """, tenantId, documentId, workOrderId);
        return document;
    }

    private S3Presigner presigner() {
        var builder = S3Presigner.builder()
                .region(Region.of(properties.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey())
                ));
        if (properties.endpoint() != null && !properties.endpoint().isBlank()) {
            builder.endpointOverride(URI.create(properties.endpoint()));
        }
        return builder.build();
    }

    private S3Client s3Client() {
        var builder = S3Client.builder()
                .region(Region.of(properties.region()))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(properties.accessKeyId(), properties.secretAccessKey())
                ));
        if (properties.endpoint() != null && !properties.endpoint().isBlank()) {
            builder.endpointOverride(URI.create(properties.endpoint()));
        }
        return builder.build();
    }

    private void deleteObject(String bucket, String objectKey) {
        try (var client = s3Client()) {
            client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build());
        }
    }

    private byte[] objectBytes(String bucket, String objectKey) {
        try (var client = s3Client()) {
            return client.getObjectAsBytes(GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(objectKey)
                    .build()).asByteArray();
        }
    }

    private void requireConfigured() {
        if (isBlank(properties.bucket()) || isBlank(properties.accessKeyId()) || isBlank(properties.secretAccessKey()) || isBlank(properties.endpoint())) {
            throw new BadRequestException("Object storage is not configured.");
        }
    }

    private PresignedPhotoUpload createPresignedUpload(
            UUID tenantId,
            UUID actorUserId,
            String ownerType,
            UUID ownerId,
            String objectKey,
            String contentType,
            long byteSize
    ) {
        var documentId = jdbcTemplate.queryForObject("""
                INSERT INTO documents (
                    tenant_id, owner_type, owner_id, bucket, object_key, content_type, byte_size, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId,
                ownerType,
                ownerId,
                properties.bucket(),
                objectKey,
                contentType,
                byteSize,
                actorUserId,
                actorUserId
        );

        var expiresAt = Instant.now().plusSeconds(properties.uploadExpiresSeconds());
        var putObject = PutObjectRequest.builder()
                .bucket(properties.bucket())
                .key(objectKey)
                .contentType(contentType)
                .build();
        var presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofSeconds(properties.uploadExpiresSeconds()))
                .putObjectRequest(putObject)
                .build();
        try (var presigner = presigner()) {
            var presigned = presigner.presignPutObject(presignRequest);
            return new PresignedPhotoUpload(
                    documentId,
                    properties.bucket(),
                    objectKey,
                    presigned.url().toString(),
                    expiresAt,
                    Map.of("Content-Type", contentType)
            );
        }
    }

    private String documentType(String documentType) {
        var normalized = documentType == null || documentType.isBlank() ? "WORK_PHOTO" : documentType.trim().toUpperCase(Locale.ROOT);
        if (!normalized.equals("WORK_PHOTO") && !normalized.equals("PURCHASE_RECEIPT")) {
            throw new BadRequestException("Document type is not supported.");
        }
        return normalized;
    }

    private String contentType(String contentType, String documentType) {
        var normalized = contentType == null || contentType.isBlank() ? "image/jpeg" : contentType.trim().toLowerCase(Locale.ROOT);
        if (documentType.equals("WORK_PHOTO") && !normalized.startsWith("image/")) {
            throw new BadRequestException("Only image uploads are supported for work photos.");
        }
        if (documentType.equals("PURCHASE_RECEIPT") && !normalized.startsWith("image/") && !normalized.equals("application/pdf")) {
            throw new BadRequestException("Only image or PDF receipt uploads are supported.");
        }
        return normalized;
    }

    private String logoContentType(String contentType) {
        var normalized = contentType == null || contentType.isBlank() ? "image/png" : contentType.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("image/png", "image/jpeg", "image/webp", "image/gif").contains(normalized)) {
            throw new BadRequestException("Logo must be a PNG, JPG, WEBP, or GIF image.");
        }
        return normalized;
    }

    private String objectKey(UUID tenantId, UUID workOrderId, String fileName, String documentType) {
        var today = LocalDate.now();
        var folder = documentType.equals("PURCHASE_RECEIPT") ? "receipts" : "photos";
        return "tenants/%s/work-orders/%s/%s/%04d/%02d/%02d/%s-%s".formatted(
                tenantId,
                workOrderId,
                folder,
                today.getYear(),
                today.getMonthValue(),
                today.getDayOfMonth(),
                UUID.randomUUID(),
                safeFileName(fileName)
        );
    }

    private String tenantLogoObjectKey(UUID tenantId, String fileName) {
        var today = LocalDate.now();
        return "tenants/%s/branding/logos/%04d/%02d/%02d/%s-%s".formatted(
                tenantId,
                today.getYear(),
                today.getMonthValue(),
                today.getDayOfMonth(),
                UUID.randomUUID(),
                safeFileName(fileName == null || fileName.isBlank() ? "logo.png" : fileName)
        );
    }

    private String userProfilePhotoObjectKey(UUID tenantId, UUID userId, String fileName) {
        var today = LocalDate.now();
        return "tenants/%s/users/%s/profile-photos/%04d/%02d/%02d/%s-%s".formatted(
                tenantId,
                userId,
                today.getYear(),
                today.getMonthValue(),
                today.getDayOfMonth(),
                UUID.randomUUID(),
                safeFileName(fileName == null || fileName.isBlank() ? "profile-photo.png" : fileName)
        );
    }

    private String safeFileName(String fileName) {
        var fallback = "photo.jpg";
        var candidate = fileName == null || fileName.isBlank() ? fallback : fileName.trim();
        return candidate.replaceAll("[^A-Za-z0-9._-]", "-");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    public record DeletedDocument(UUID documentId, String bucket, String objectKey) {
    }

    public record StoredLogo(String contentType, byte[] bytes) {
    }

    private record StoredDocument(String bucket, String objectKey) {
    }
}
