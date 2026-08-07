package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record WorkOrderReviewDto(
        WorkOrderDto workOrder,
        List<FieldNoteDto> fieldNotes,
        List<EvidenceDto> evidence,
        List<TimeEntryDto> timeEntries,
        List<InvoiceDto> invoices,
        List<AuditEntryDto> auditLogs
) {
    public record FieldNoteDto(
            UUID id,
            String workerName,
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
            String contentType,
            Long byteSize,
            String createdByName,
            Instant capturedAt,
            Instant createdAt,
            Map<String, Object> metadata
    ) {
    }

    public record TimeEntryDto(
            UUID id,
            String workerName,
            String entryType,
            Instant startedAt,
            Instant endedAt,
            Long durationMinutes
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
