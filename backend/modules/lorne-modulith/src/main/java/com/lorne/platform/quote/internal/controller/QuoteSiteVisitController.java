package com.lorne.platform.quote.internal.controller;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.quote.internal.dto.QuoteSiteDetails;
import com.lorne.platform.quote.internal.dto.QuoteSiteDetails.*;
import com.lorne.platform.quote.internal.service.QuoteSiteVisitService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/tenant/quotes/{quoteId}")
@PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
class QuoteSiteVisitController {
    private final QuoteSiteVisitService service;
    QuoteSiteVisitController(QuoteSiteVisitService service) { this.service = service; }

    @GetMapping("/site-visit")
    ApiResponse<QuoteSiteDetails> details(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId) {
        return ApiResponse.ok(service.details(user.tenantId(), quoteId));
    }

    @PostMapping("/site-visit/link")
    ApiResponse<CaptureLink> link(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId, @RequestBody LinkRequest request) {
        return ApiResponse.ok(service.createLink(user.tenantId(), user.userId(), quoteId, request.accessPassword()));
    }

    @PostMapping("/site-visit/revoke")
    ApiResponse<Void> revoke(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId) {
        service.revoke(user.tenantId(), user.userId(), quoteId); return ApiResponse.ok(null);
    }

    @PostMapping("/site-visit/notes")
    ApiResponse<Note> note(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId, @Valid @RequestBody NoteRequest request) {
        return ApiResponse.ok(service.addNote(user.tenantId(), user.userId(), quoteId, request.authorName(), request.body()));
    }

    @PostMapping(value = "/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ApiResponse<Photo> upload(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId,
            @RequestParam MultipartFile file, @RequestParam(defaultValue = "") String caption,
            @RequestParam(defaultValue = "true") boolean clientVisible, @RequestParam String authorName, @RequestParam UUID uploadId) {
        return ApiResponse.ok(service.upload(user.tenantId(), user.userId(), quoteId, file, caption, clientVisible, authorName, uploadId));
    }

    @GetMapping("/photos/{photoId}/image")
    ResponseEntity<byte[]> image(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId, @PathVariable UUID photoId) {
        return imageResponse(service.photo(user.tenantId(), quoteId, photoId));
    }

    @PatchMapping("/photos/{photoId}")
    ApiResponse<Void> update(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId, @PathVariable UUID photoId,
            @Valid @RequestBody PhotoRequest request) {
        service.updatePhoto(user.tenantId(), user.userId(), quoteId, photoId, request.caption(), request.clientVisible()); return ApiResponse.ok(null);
    }

    @DeleteMapping("/photos/{photoId}")
    ApiResponse<Void> delete(@AuthenticationPrincipal JwtPrincipal user, @PathVariable UUID quoteId, @PathVariable UUID photoId) {
        service.deletePhoto(user.tenantId(), user.userId(), quoteId, photoId); return ApiResponse.ok(null);
    }

    static ResponseEntity<byte[]> imageResponse(DocumentStorageService.StoredLogo image) {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(image.contentType()))
                .header("Cache-Control", "no-store").header("X-Content-Type-Options", "nosniff")
                .header("Referrer-Policy", "no-referrer").header("X-Robots-Tag", "noindex, nofollow").body(image.bytes());
    }

    record LinkRequest(String accessPassword) { }
    record NoteRequest(@NotBlank @Size(max = 120) String authorName, @NotBlank @Size(max = 10000) String body) { }
    record PhotoRequest(@Size(max = 500) @jakarta.validation.constraints.NotNull String caption, boolean clientVisible) { }
}
