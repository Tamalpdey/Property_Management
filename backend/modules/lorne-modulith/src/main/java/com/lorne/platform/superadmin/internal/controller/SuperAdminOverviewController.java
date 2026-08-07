package com.lorne.platform.superadmin.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.superadmin.internal.dto.SuperAdminOverviewResponse;
import com.lorne.platform.superadmin.internal.service.SuperAdminOverviewService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/superadmin")
class SuperAdminOverviewController {
    private final SuperAdminOverviewService overviewService;

    SuperAdminOverviewController(SuperAdminOverviewService overviewService) {
        this.overviewService = overviewService;
    }

    @GetMapping("/overview")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    ApiResponse<SuperAdminOverviewResponse> overview() {
        return ApiResponse.ok(overviewService.overview());
    }
}
