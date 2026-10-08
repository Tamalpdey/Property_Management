package com.lorne.platform.auth.internal.controller;

import com.lorne.platform.auth.internal.dto.CurrentUserResponse;
import com.lorne.platform.auth.internal.dto.LoginRequest;
import com.lorne.platform.auth.internal.dto.LoginResponse;
import com.lorne.platform.auth.internal.dto.LogoutRequest;
import com.lorne.platform.auth.internal.dto.RefreshTokenRequest;
import com.lorne.platform.auth.internal.dto.UpdateProfilePhotoRequest;
import com.lorne.platform.auth.internal.service.AuthService;
import com.lorne.platform.auth.internal.service.PortalLoginPolicy;
import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.document.PhotoUploadRequest;
import com.lorne.platform.document.PresignedPhotoUpload;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {
    private final AuthService authService;
    private final DocumentStorageService documentStorageService;
    private final PortalLoginPolicy portalLoginPolicy;

    AuthController(AuthService authService, DocumentStorageService documentStorageService, PortalLoginPolicy portalLoginPolicy) {
        this.authService = authService;
        this.documentStorageService = documentStorageService;
        this.portalLoginPolicy = portalLoginPolicy;
    }

    @PostMapping("/login")
    ApiResponse<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            @RequestHeader(value = "X-Request-Source", required = false) String source,
            HttpServletRequest servletRequest
    ) {
        var portalAccess = portalLoginPolicy.resolve(servletRequest.getHeader(HttpHeaders.HOST), source);
        portalLoginPolicy.requireRequestedTenant(portalAccess, request.tenantId());
        return ApiResponse.ok(authService.login(request, source, portalAccess));
    }

    @PostMapping("/refresh")
    ApiResponse<LoginResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request,
            @RequestHeader(value = "X-Request-Source", required = false) String source,
            HttpServletRequest servletRequest
    ) {
        var portalAccess = portalLoginPolicy.resolve(servletRequest.getHeader(HttpHeaders.HOST), source);
        return ApiResponse.ok(authService.refresh(request, source, portalAccess));
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

    @PostMapping("/me/profile-photo/upload-url")
    ApiResponse<PresignedPhotoUpload> profilePhotoUploadUrl(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody PhotoUploadRequest request
    ) {
        return ApiResponse.ok(documentStorageService.createUserProfilePhotoUpload(principal.tenantId(), principal.userId(), request));
    }

    @PutMapping("/me/profile-photo")
    ApiResponse<CurrentUserResponse> updateProfilePhoto(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody UpdateProfilePhotoRequest request
    ) {
        return ApiResponse.ok(authService.updateProfilePhoto(principal, request));
    }

    @GetMapping("/profile-photo/{documentId}")
    ResponseEntity<Void> profilePhoto(@PathVariable UUID documentId) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, documentStorageService.createUserProfilePhotoReadUrl(documentId))
                .build();
    }
}
