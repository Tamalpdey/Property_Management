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
    private final QuoteManagementService quoteManagementService;

    PublicQuoteController(QuoteManagementService quoteManagementService) {
        this.quoteManagementService = quoteManagementService;
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
