package com.lorne.platform.auth.internal.controller;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.auth.internal.dto.LoginRequest;
import com.lorne.platform.auth.internal.dto.LoginResponse;
import com.lorne.platform.auth.internal.dto.LogoutRequest;
import com.lorne.platform.auth.internal.dto.RefreshTokenRequest;
import com.lorne.platform.auth.internal.service.AuthService;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.RequestHeader;
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
    ApiResponse<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = "X-Request-Source", required = false) String source
    ) {
        return ApiResponse.ok(authService.login(request, source));
    }

    @PostMapping("/refresh")
    ApiResponse<LoginResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request,
            @RequestHeader(value = "X-Request-Source", required = false) String source
    ) {
        return ApiResponse.ok(authService.refresh(request, source));
    }

    @PostMapping("/logout")
    ApiResponse<Void> logout(@RequestBody(required = false) LogoutRequest request) {
        authService.logout(request);
        return ApiResponse.ok(null);
    }

    @GetMapping("/me")
    ApiResponse<CurrentUserResponse> me(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(authService.currentUser(principal));
    }
}
