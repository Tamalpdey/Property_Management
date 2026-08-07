package com.lorne.platform.worker.internal.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record CreateWorkerRequest(
        String employeeNumber,
        @NotBlank String displayName,
        String phone,
        String email,
        String engagementType,
        Integer maxWeeklyHours,
        BigDecimal hourlyRate,
        LocalDate hireDate,
        @Valid EmergencyContactRequest emergencyContact,
        List<@Valid CertificationRequest> certifications,
        List<UUID> serviceTypeIds,
        List<@Valid ShiftTemplateRequest> shifts
) {
    public record EmergencyContactRequest(@NotBlank String contactName, String relationship, @NotBlank String phone) {
    }

    public record CertificationRequest(@NotBlank String certificationName, String issuedBy, LocalDate issuedOn, LocalDate expiresOn) {
    }

    public record ShiftTemplateRequest(
            int dayOfWeek,
            LocalTime startTime,
            LocalTime endTime,
            String timezone
    ) {
    }
}
