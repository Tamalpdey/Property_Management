package com.lorne.platform.notification.internal.controller;

import com.lorne.platform.notification.internal.dto.EmailDeliveryLogDto;
import com.lorne.platform.notification.internal.dto.ResendEmailDeliveryRequest;
import com.lorne.platform.notification.internal.service.EmailDeliveryLogService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/email-deliveries")
class EmailDeliveryLogController {
    private final EmailDeliveryLogService emailDeliveryLogService;

    EmailDeliveryLogController(EmailDeliveryLogService emailDeliveryLogService) {
        this.emailDeliveryLogService = emailDeliveryLogService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<EmailDeliveryLogDto>> list(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false) Integer limit
    ) {
        return ApiResponse.ok(emailDeliveryLogService.list(principal.tenantId(), limit));
    }

    @PostMapping("/{deliveryLogId}/resend")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<EmailDeliveryLogDto> resend(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID deliveryLogId,
            @RequestBody(required = false) ResendEmailDeliveryRequest request
    ) {
        return ApiResponse.ok(emailDeliveryLogService.resend(principal.tenantId(), principal.userId(), deliveryLogId, request));
    }
}
