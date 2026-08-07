package com.lorne.platform.notification.internal.controller;

import com.lorne.platform.notification.internal.dto.EmailTemplateDto;
import com.lorne.platform.notification.internal.dto.UpdateEmailTemplateRequest;
import com.lorne.platform.notification.internal.service.EmailTemplateService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/email-templates")
class EmailTemplateController {
    private final EmailTemplateService emailTemplateService;

    EmailTemplateController(EmailTemplateService emailTemplateService) {
        this.emailTemplateService = emailTemplateService;
    }

    @GetMapping("/invoice-owner")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<EmailTemplateDto> invoiceTemplate(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(emailTemplateService.invoiceTemplate(principal.tenantId(), principal.userId()));
    }

    @PutMapping("/invoice-owner")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','FINANCE')")
    ApiResponse<EmailTemplateDto> updateInvoiceTemplate(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody UpdateEmailTemplateRequest request
    ) {
        return ApiResponse.ok(emailTemplateService.updateInvoiceTemplate(principal.tenantId(), principal.userId(), request));
    }

    @GetMapping("/work-order-completed-owner")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<EmailTemplateDto> workOrderCompletedTemplate(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(emailTemplateService.workOrderCompletedTemplate(principal.tenantId(), principal.userId()));
    }

    @PutMapping("/work-order-completed-owner")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS')")
    ApiResponse<EmailTemplateDto> updateWorkOrderCompletedTemplate(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody UpdateEmailTemplateRequest request
    ) {
        return ApiResponse.ok(emailTemplateService.updateWorkOrderCompletedTemplate(principal.tenantId(), principal.userId(), request));
    }
}
