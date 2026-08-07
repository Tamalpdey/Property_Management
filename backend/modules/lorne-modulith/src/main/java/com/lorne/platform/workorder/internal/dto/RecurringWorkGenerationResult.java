package com.lorne.platform.workorder.internal.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record RecurringWorkGenerationResult(
        int generatedCount,
        LocalDate throughDate,
        List<GeneratedDraftDto> drafts
) {
    public record GeneratedDraftDto(
            UUID workOrderId,
            String workOrderNumber,
            UUID templateId,
            String title,
            UUID propertyId,
            String propertyName,
            UUID serviceTypeId,
            String serviceName,
            LocalDate occurrenceDate,
            Instant scheduledStart,
            Instant scheduledEnd
    ) {
    }
}
