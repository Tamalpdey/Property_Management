package com.lorne.platform.worker.internal.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

public record WorkerDto(
        UUID id,
        String employeeNumber,
        String displayName,
        String phone,
        String email,
        boolean appLoginEnabled,
        String status,
        String engagementType,
        Integer maxWeeklyHours,
        BigDecimal hourlyRate,
        LocalDate hireDate,
        EmergencyContactDto emergencyContact,
        List<CertificationDto> certifications,
        List<ServiceSkillDto> serviceSkills,
        List<ShiftTemplateDto> shifts
) {
    public record EmergencyContactDto(String contactName, String relationship, String phone) {
    }

    public record CertificationDto(UUID id, String certificationName, String issuedBy, LocalDate issuedOn, LocalDate expiresOn) {
    }

    public record ServiceSkillDto(UUID serviceTypeId, String serviceName, String categoryName, String skillLevel) {
    }

    public record ShiftTemplateDto(UUID id, int dayOfWeek, LocalTime startTime, LocalTime endTime, String timezone, boolean active) {
    }
}
