package com.lorne.platform.finance.internal.controller;

import com.lorne.platform.finance.internal.dto.InvoiceDto;
import com.lorne.platform.finance.internal.dto.CreateBatchInvoiceRequest;
import com.lorne.platform.finance.internal.dto.InvoiceLineRequest;
import com.lorne.platform.finance.internal.dto.OwnerStatementDto;
import com.lorne.platform.finance.internal.dto.RecordPaymentRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailResponse;
import com.lorne.platform.finance.internal.dto.UpdateInvoiceStatusRequest;
import com.lorne.platform.finance.internal.service.InvoiceService;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/invoices")
class InvoiceController {
    private final InvoiceService invoiceService;

    InvoiceController(InvoiceService invoiceService) {
        this.invoiceService = invoiceService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<InvoiceDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(invoiceService.list(principal.tenantId()));
    }

    @GetMapping("/{invoiceId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<InvoiceDto> get(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId
    ) {
        return ApiResponse.ok(invoiceService.get(principal.tenantId(), invoiceId));
    }

    @GetMapping("/owners/{ownerId}/statement")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<OwnerStatementDto> ownerStatement(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID ownerId
    ) {
        return ApiResponse.ok(invoiceService.ownerStatement(principal.tenantId(), ownerId));
    }

    @PostMapping("/batch")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<InvoiceDto> createBatch(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateBatchInvoiceRequest request
    ) {
        return ApiResponse.ok(invoiceService.createBatch(principal.tenantId(), principal.userId(), request));
    }

    @GetMapping("/{invoiceId}/pdf")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ResponseEntity<byte[]> pdf(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId
    ) {
        var invoice = invoiceService.get(principal.tenantId(), invoiceId);
        var pdf = invoiceService.pdf(principal.tenantId(), principal.userId(), invoiceId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(safeFilename(invoice.invoiceNumber()) + ".pdf")
                        .build()
                        .toString())
                .body(pdf);
    }

    @PostMapping("/{invoiceId}/lines")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<InvoiceDto> addLine(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId,
            @Valid @RequestBody InvoiceLineRequest request
    ) {
        return ApiResponse.ok(invoiceService.addLine(principal.tenantId(), principal.userId(), invoiceId, request));
    }

    @DeleteMapping("/{invoiceId}/lines/{lineId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<InvoiceDto> deleteLine(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId,
            @PathVariable UUID lineId
    ) {
        return ApiResponse.ok(invoiceService.deleteLine(principal.tenantId(), principal.userId(), invoiceId, lineId));
    }

    @PatchMapping("/{invoiceId}/status")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<InvoiceDto> updateStatus(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId,
            @RequestBody UpdateInvoiceStatusRequest request
    ) {
        return ApiResponse.ok(invoiceService.updateStatus(principal.tenantId(), principal.userId(), invoiceId, request));
    }

    @PostMapping("/{invoiceId}/payments")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<InvoiceDto> recordPayment(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId,
            @RequestBody RecordPaymentRequest request
    ) {
        return ApiResponse.ok(invoiceService.recordPayment(principal.tenantId(), principal.userId(), invoiceId, request));
    }

    @PostMapping("/{invoiceId}/email")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<SendInvoiceEmailResponse> sendEmail(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID invoiceId,
            @RequestBody SendInvoiceEmailRequest request
    ) {
        return ApiResponse.ok(invoiceService.sendInvoice(principal.tenantId(), principal.userId(), invoiceId, request));
    }

    private String safeFilename(String value) {
        return value == null ? "invoice" : value.replaceAll("[^A-Za-z0-9._-]", "_");
    }
}
