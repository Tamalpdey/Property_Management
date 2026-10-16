package com.lorne.platform.quote.internal.controller;

import com.lorne.platform.quote.internal.dto.QuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteModuleStatus;
import com.lorne.platform.quote.internal.dto.QuoteSendResult;
import com.lorne.platform.quote.internal.dto.SendQuoteRequest;
import com.lorne.platform.quote.internal.dto.UpsertQuoteRequest;
import com.lorne.platform.quote.internal.dto.ShareQuoteRequest;
import com.lorne.platform.quote.internal.dto.QuoteShareResult;
import com.lorne.platform.quote.internal.dto.QuoteSharingDetails;
import com.lorne.platform.quote.internal.dto.ConvertQuoteRequest;
import com.lorne.platform.quote.internal.service.QuoteManagementService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/quotes")
class QuoteManagementController {
    private final QuoteManagementService quoteManagementService;

    QuoteManagementController(QuoteManagementService quoteManagementService) {
        this.quoteManagementService = quoteManagementService;
    }

    @GetMapping("/module-status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteModuleStatus> moduleStatus(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(quoteManagementService.moduleStatus(principal.tenantId()));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<QuoteDto>> list(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "ALL") String status
    ) {
        return ApiResponse.ok(quoteManagementService.list(principal.tenantId(), search, status));
    }

    @GetMapping("/{quoteId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteDto> get(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId) {
        return ApiResponse.ok(quoteManagementService.get(principal.tenantId(), quoteId));
    }

    @GetMapping("/{quoteId}/pdf")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ResponseEntity<byte[]> pdf(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId) {
        var quote = quoteManagementService.get(principal.tenantId(), quoteId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(quote.quoteNumber().replaceAll("[^A-Za-z0-9._-]", "_") + ".pdf").build().toString())
                .body(quoteManagementService.pdf(principal.tenantId(), principal.userId(), quoteId));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody UpsertQuoteRequest request
    ) {
        return ApiResponse.ok(quoteManagementService.create(principal.tenantId(), principal.userId(), request));
    }

    @PatchMapping("/{quoteId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID quoteId,
            @Valid @RequestBody UpsertQuoteRequest request
    ) {
        return ApiResponse.ok(quoteManagementService.update(principal.tenantId(), principal.userId(), quoteId, request));
    }

    @PostMapping("/{quoteId}/send")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteSendResult> send(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID quoteId,
            @Valid @RequestBody SendQuoteRequest request
    ) {
        return ApiResponse.ok(quoteManagementService.send(principal.tenantId(), principal.userId(), quoteId, request));
    }

    @PostMapping("/{quoteId}/share")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteShareResult> share(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId,
                                       @Valid @RequestBody ShareQuoteRequest request) {
        return ApiResponse.ok(quoteManagementService.share(principal.tenantId(), principal.userId(), quoteId, request.accessPassword()));
    }

    @GetMapping("/{quoteId}/sharing")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteSharingDetails> sharing(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId) {
        return ApiResponse.ok(quoteManagementService.sharing(principal.tenantId(), quoteId));
    }

    @PostMapping("/{quoteId}/convert")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<QuoteDto> convert(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId,
                                 @RequestBody(required = false) ConvertQuoteRequest request) {
        return ApiResponse.ok(quoteManagementService.convert(principal.tenantId(), principal.userId(), quoteId,
                request == null ? null : request.propertyId()));
    }

    @PostMapping("/{quoteId}/void")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<QuoteDto> voidQuote(@AuthenticationPrincipal JwtPrincipal principal, @PathVariable UUID quoteId) {
        return ApiResponse.ok(quoteManagementService.voidQuote(principal.tenantId(), principal.userId(), quoteId));
    }
}
