package com.lorne.platform.quote.internal.controller;

import com.lorne.platform.quote.internal.dto.PublicQuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteDecisionRequest;
import com.lorne.platform.quote.internal.service.QuoteManagementService;
import com.lorne.platform.shared.response.ApiResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.server.ResponseStatusException;
import com.lorne.platform.shared.response.ApiError;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/quotes")
class PublicQuoteController {
    private final com.lorne.platform.quote.internal.service.QuoteSiteVisitService siteVisits;
    private final QuoteManagementService quoteManagementService;

    PublicQuoteController(QuoteManagementService quoteManagementService, com.lorne.platform.quote.internal.service.QuoteSiteVisitService siteVisits) {
        this.quoteManagementService = quoteManagementService;
        this.siteVisits = siteVisits;
    }

    @GetMapping("/{token}/photos")
    ApiResponse<java.util.List<com.lorne.platform.quote.internal.dto.QuoteSiteDetails.Photo>> photos(@PathVariable String token,
            @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return ApiResponse.ok(siteVisits.clientPhotos(token, password));
    }

    @GetMapping("/{token}/photos/{photoId}/image")
    ResponseEntity<byte[]> photo(@PathVariable String token, @PathVariable java.util.UUID photoId,
            @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return QuoteSiteVisitController.imageResponse(siteVisits.clientPhoto(token, password, photoId));
    }

    @GetMapping("/capture/{token}")
    ApiResponse<com.lorne.platform.quote.internal.dto.QuoteSiteDetails.CaptureView> capture(@PathVariable String token,
            @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return ApiResponse.ok(siteVisits.capture(token, password));
    }

    @PostMapping("/capture/{token}/notes")
    ApiResponse<com.lorne.platform.quote.internal.dto.QuoteSiteDetails.Note> captureNote(@PathVariable String token,
            @RequestHeader(value = "X-Quote-Password", required = false) String password,
            @Valid @RequestBody QuoteSiteVisitController.NoteRequest request) {
        return ApiResponse.ok(siteVisits.captureNote(token, password, request.authorName(), request.body()));
    }

    @PostMapping(value = "/capture/{token}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ApiResponse<com.lorne.platform.quote.internal.dto.QuoteSiteDetails.Photo> capturePhoto(@PathVariable String token,
            @RequestHeader(value = "X-Quote-Password", required = false) String password,
            @org.springframework.web.bind.annotation.RequestParam org.springframework.web.multipart.MultipartFile file,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "") String caption,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "true") boolean clientVisible,
            @org.springframework.web.bind.annotation.RequestParam String authorName,
            @org.springframework.web.bind.annotation.RequestParam java.util.UUID uploadId) {
        return ApiResponse.ok(siteVisits.capturePhoto(token, password, file, caption, clientVisible, authorName, uploadId));
    }

    @GetMapping("/capture/{token}/photos/{photoId}/image")
    ResponseEntity<byte[]> captureImage(@PathVariable String token, @PathVariable java.util.UUID photoId,
            @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return QuoteSiteVisitController.imageResponse(siteVisits.capturePhotoBytes(token, password, photoId));
    }

    @ModelAttribute
    void privateResponse(HttpServletResponse response) {
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("X-Robots-Tag", "noindex, nofollow");
        response.setHeader("Referrer-Policy", "no-referrer");
    }

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<ApiResponse<Void>> accessError(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode())
                .body(ApiResponse.fail(ApiError.of("QUOTE_ACCESS_DENIED", exception.getReason())));
    }

    @GetMapping("/{token}")
    ApiResponse<PublicQuoteDto> get(@PathVariable String token, @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return ApiResponse.ok(quoteManagementService.publicQuote(token, password));
    }

    @PostMapping("/{token}/approve")
    ApiResponse<PublicQuoteDto> approve(@PathVariable String token, @RequestHeader(value = "X-Quote-Password", required = false) String password,
                                       @Valid @RequestBody QuoteDecisionRequest request) {
        return ApiResponse.ok(quoteManagementService.decide(token, password, true, request));
    }

    @PostMapping("/{token}/decline")
    ApiResponse<PublicQuoteDto> decline(@PathVariable String token, @RequestHeader(value = "X-Quote-Password", required = false) String password,
                                       @Valid @RequestBody QuoteDecisionRequest request) {
        return ApiResponse.ok(quoteManagementService.decide(token, password, false, request));
    }

    @GetMapping("/{token}/pdf")
    ResponseEntity<byte[]> pdf(@PathVariable String token,
                               @RequestHeader(value = "X-Quote-Password", required = false) String password) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=quote.pdf")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(quoteManagementService.publicPdf(token, password));
    }
}
