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
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/field-worker/communications")
class WorkerCommunicationController {
    private final CommunicationService communicationService;

    WorkerCommunicationController(CommunicationService communicationService) {
        this.communicationService = communicationService;
    }

    @GetMapping
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<List<ConversationDto>> list(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(communicationService.workerConversations(
                principal.tenantId(),
                principal.userId(),
                principal.email()
        ));
    }

    @PostMapping("/operations")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<ConversationThreadDto> operationsThread(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody(required = false) CreateConversationRequest request
    ) {
        var safeRequest = request == null ? new CreateConversationRequest(null, null, List.of(), null, null) : request;
        return ApiResponse.ok(communicationService.createWorkerOperationsConversation(
                principal.tenantId(),
                principal.userId(),
                principal.email(),
                safeRequest
        ));
    }

    @GetMapping("/{conversationId}")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<ConversationThreadDto> thread(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId
    ) {
        return ApiResponse.ok(communicationService.workerThread(
                principal.tenantId(),
                principal.userId(),
                principal.email(),
                conversationId
        ));
    }

    @PostMapping("/{conversationId}/messages")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<ConversationMessageDto> send(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request
    ) {
        return ApiResponse.ok(communicationService.sendWorkerMessage(
                principal.tenantId(),
                principal.userId(),
                principal.email(),
                conversationId,
                request
        ));
    }

    @PostMapping("/{conversationId}/read")
    @PreAuthorize("hasRole('FIELD_WORKER')")
    ApiResponse<ConversationThreadDto> markRead(
            @AuthenticationPrincipal JwtPrincipal principal,
            @PathVariable UUID conversationId
    ) {
        return ApiResponse.ok(communicationService.markWorkerRead(
                principal.tenantId(),
                principal.userId(),
                principal.email(),
                conversationId
        ));
    }
}
