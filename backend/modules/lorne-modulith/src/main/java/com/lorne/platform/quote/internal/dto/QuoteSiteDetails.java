package com.lorne.platform.quote.internal.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record QuoteSiteDetails(List<Photo> photos, List<Note> notes, CaptureLink captureLink) {
    public record Photo(UUID id, String caption, boolean clientVisible, String authorName, String source, Instant createdAt) { }
    public record Note(UUID id, String authorName, String body, String source, Instant createdAt) { }
    public record CaptureLink(String publicUrl, Instant expiresAt, boolean active) { }
    // Deliberately excludes pricing, customer contact details, terms and approval credentials.
    public record CaptureView(String companyName, String logoUrl, String primaryColor, String quoteNumber,
                              String title, String propertyName, String propertyAddress, String scope,
                              Instant expiresAt, List<Photo> photos, List<Note> notes, String timezone) { }
}
