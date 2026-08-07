package com.lorne.platform.auth.internal.controller;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.auth.internal.dto.LoginRequest;
import com.lorne.platform.auth.internal.dto.LoginResponse;
import com.lorne.platform.auth.internal.service.AuthService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {
    private final AuthService authService;

    AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    ApiResponse<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ApiResponse.ok(authService.login(request));
    }

    @GetMapping("/me")
    ApiResponse<CurrentUserResponse> me(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(authService.currentUser(principal));
    }
}
