package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkOrderReviewDto(
        WorkOrderDto workOrder,
        List<FieldNoteDto> fieldNotes,
        List<WorkOrderMaintenanceRecordDto> maintenanceRecords,
        List<EvidenceDto> evidence,
        List<WorkerActivityDto> workerActivities,
        List<TimeEntryDto> timeEntries,
        List<InvoiceDto> invoices,
        List<CommunicationDto> communications,
        List<AuditEntryDto> auditLogs
) {
    public record FieldNoteDto(
            UUID id,
            UUID workerId,
            String workerName,
            String workerEmail,
            String note,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record EvidenceDto(
            UUID documentId,
            String documentType,
            String photoType,
            String caption,
            String bucket,
            String objectKey,
            String viewUrl,
            String contentType,
            Long byteSize,
            UUID workerId,
            String createdByName,
            String createdByEmail,
            Instant capturedAt,
            Instant createdAt,
            Map<String, Object> metadata
    ) {
    }

    public record TimeEntryDto(
            UUID id,
            UUID workerId,
            String workerName,
            String entryType,
            Instant startedAt,
            Instant endedAt,
            Long durationMinutes
    ) {
    }

    public record WorkerActivityDto(
            UUID id,
            UUID workerId,
            String workerName,
            String workerEmail,
            String activityType,
            String title,
            String locationName,
            String address,
            String notes,
            Instant startedAt,
            Instant endedAt,
            Long durationMinutes,
            boolean open
    ) {
    }

    public record InvoiceDto(
            UUID id,
            String invoiceNumber,
            String status,
            String issuedOn,
            String dueOn,
            String subtotal,
            String taxTotal,
            String total
    ) {
    }

    public record CommunicationDto(
            UUID id,
            String communicationType,
            UUID invoiceId,
            String invoiceNumber,
            String recipientEmail,
            String subject,
            String body,
            String status,
            String providerMessage,
            String deliveryMode,
            Instant sentAt,
            Instant createdAt
    ) {
    }

    public record AuditEntryDto(
            UUID id,
            UUID actorUserId,
            String actorName,
            String actorEmail,
            String action,
            Map<String, Object> metadata,
            Instant createdAt
    ) {
    }
}
