package com.lorne.platform.communication.internal.controller;

import com.lorne.platform.communication.internal.dto.ConversationDto;
import com.lorne.platform.communication.internal.dto.ConversationMessageDto;
import com.lorne.platform.communication.internal.dto.ConversationThreadDto;
import com.lorne.platform.communication.internal.dto.CreateConversationRequest;
import com.lorne.platform.communication.internal.dto.SendMessageRequest;
import com.lorne.platform.communication.internal.service.CommunicationService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/communications")
class TenantCommunicationController {
    private final CommunicationService communicationService;

    TenantCommunicationController(CommunicationService communicationService) {
        this.communicationService = communicationService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<List<ConversationDto>> list(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestParam(required = false, defaultValue = "ALL") String channelType,
            @RequestParam(required = false) UUID workOrderId
    ) {
        return ApiResponse.ok(communicationService.tenantConversations(
                principal.tenantId(),
                principal.userId(),
                channelType,
                workOrderId
        ));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<ConversationThreadDto> create(
            @AuthenticationPrincipal JwtPrincipal principal,
            @Valid @RequestBody CreateConversationRequest request
    ) {
        return ApiResponse.ok(communicationService.createTenantConversation(
                principal.tenantId(),
                principal.userId(),
                request
        ));
    }

    @GetMapping("/{conversationId}")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<ConversationThreadDto> thread(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId
    ) {
        return ApiResponse.ok(communicationService.tenantThread(
                principal.tenantId(),
                principal.userId(),
                conversationId
        ));
    }

    @PostMapping("/{conversationId}/messages")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<ConversationMessageDto> send(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return ApiResponse.ok(communicationService.sendTenantMessage(
                principal.tenantId(),
                principal.userId(),
                conversationId,
                request
        ));
    }

    @PostMapping("/{conversationId}/read")
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<ConversationThreadDto> markRead(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId
    ) {
        return ApiResponse.ok(communicationService.markTenantRead(
                principal.tenantId(),
                principal.userId(),
                conversationId
        ));
    }
}
