package com.lorne.platform.system.internal.controller;

import com.lorne.platform.shared.response.ApiResponse;
import java.time.Instant;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/system")
class SystemHealthController {
    @GetMapping("/health")
    ApiResponse<SystemHealth> health() {
        return ApiResponse.ok(new SystemHealth("UP", "lorne-modulith", Instant.now()));
    }

    record SystemHealth(String status, String service, Instant checkedAt) {
    }
}
