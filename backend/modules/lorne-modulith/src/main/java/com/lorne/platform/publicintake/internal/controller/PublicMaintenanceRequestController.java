package com.lorne.platform.publicintake.internal.controller;

import com.lorne.platform.publicintake.internal.dto.PublicMaintenanceRequest;
import com.lorne.platform.publicintake.internal.dto.PublicMaintenanceRequestResponse;
import com.lorne.platform.publicintake.internal.service.PublicMaintenanceRequestService;
import com.lorne.platform.shared.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/maintenance-requests")
class PublicMaintenanceRequestController {
    private final PublicMaintenanceRequestService publicMaintenanceRequestService;

    PublicMaintenanceRequestController(PublicMaintenanceRequestService publicMaintenanceRequestService) {
        this.publicMaintenanceRequestService = publicMaintenanceRequestService;
    }

    @PostMapping
    ApiResponse<PublicMaintenanceRequestResponse> create(
            @Valid @RequestBody PublicMaintenanceRequest request,
            HttpServletRequest servletRequest
    ) {
        return ApiResponse.ok(publicMaintenanceRequestService.create(request, servletRequest.getRemoteAddr()));
    }
}
