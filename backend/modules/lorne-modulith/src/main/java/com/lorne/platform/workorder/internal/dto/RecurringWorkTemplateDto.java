package com.lorne.platform.workorder.internal.dto;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record RecurringWorkTemplateDto(
        UUID id,
        UUID propertyId,
        String propertyName,
        String ownerName,
        UUID serviceTypeId,
        String serviceName,
        String title,
        String description,
        String priority,
        String recurrenceRule,
        Integer recurrenceInterval,
        LocalDate startDate,
        LocalDate endDate,
        LocalTime preferredStartTime,
        Integer durationMinutes,
        Integer generateDaysAhead,
        LocalDate lastGeneratedFor,
        boolean active
) {
}
