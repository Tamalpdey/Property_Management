package com.lorne.platform.workorder.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record CreateRecurringWorkTemplateRequest(
        @NotNull UUID propertyId,
        UUID serviceTypeId,
        @NotBlank String title,
        String description,
        String priority,
        @NotBlank String recurrenceRule,
        Integer recurrenceInterval,
        @NotNull LocalDate startDate,
        LocalDate endDate,
        LocalTime preferredStartTime,
        Integer durationMinutes,
        Integer generateDaysAhead
) {
}
