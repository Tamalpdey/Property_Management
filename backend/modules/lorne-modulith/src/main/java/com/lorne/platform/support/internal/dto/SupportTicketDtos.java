package com.lorne.platform.support.internal.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class SupportTicketDtos {
    private SupportTicketDtos() { }
    public record Create(@NotBlank @Size(max = 160) String subject, @NotBlank @Size(max = 8000) String description,
                         @NotBlank String category, @NotBlank String priority) { }
    public record Reply(@NotBlank @Size(max = 8000) String body) { }
    public record AdminReply(@NotBlank @Size(max = 8000) String body, boolean internal) { }
    public record Update(@NotBlank String status, @NotBlank String priority, UUID assignedTo, @Min(0) int version) { }
    public record Close(@Min(0) int version) { }
    public record Agent(UUID id, String displayName, String email) { }
    public record Ticket(UUID id, UUID tenantId, String tenantName, String number, String subject, String description,
                         String category, String priority, String status, UUID assignedTo, String assignedToName,
                         String createdByName, int version, Instant createdAt, Instant updatedAt, Instant resolvedAt) { }
    public record Message(UUID id, String body, String authorName, String authorType, boolean internal, Instant createdAt) { }
    public record Detail(Ticket ticket, List<Message> messages) { }
    public record Page(List<Ticket> items, long total, int page, int size) { }
}
