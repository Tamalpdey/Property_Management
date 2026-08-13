package com.lorne.platform.tenant.internal.controller;

import com.lorne.platform.document.DocumentStorageService;
import com.lorne.platform.document.PhotoUploadRequest;
import com.lorne.platform.document.PresignedPhotoUpload;
import com.lorne.platform.shared.response.ApiResponse;
import com.lorne.platform.shared.security.JwtPrincipal;
import com.lorne.platform.tenant.internal.dto.TenantSettingsDto;
import com.lorne.platform.tenant.internal.dto.UpdateTenantSettingsRequest;
import com.lorne.platform.tenant.internal.service.TenantSettingsService;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/tenant/settings")
class TenantSettingsController {
    private final TenantSettingsService tenantSettingsService;
    private final DocumentStorageService documentStorageService;

    TenantSettingsController(TenantSettingsService tenantSettingsService, DocumentStorageService documentStorageService) {
        this.tenantSettingsService = tenantSettingsService;
        this.documentStorageService = documentStorageService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('TENANT_ADMIN','OPERATIONS','FINANCE')")
    ApiResponse<TenantSettingsDto> get(@AuthenticationPrincipal JwtPrincipal principal) {
        return ApiResponse.ok(tenantSettingsService.get(principal.tenantId()));
    }

    @PutMapping
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<TenantSettingsDto> update(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody UpdateTenantSettingsRequest request
    ) {
        return ApiResponse.ok(tenantSettingsService.update(principal.tenantId(), principal.userId(), request));
    }

    @PostMapping("/logo/upload-url")
    @PreAuthorize("hasRole('TENANT_ADMIN')")
    ApiResponse<PresignedPhotoUpload> logoUploadUrl(
            @AuthenticationPrincipal JwtPrincipal principal,
            @RequestBody PhotoUploadRequest request
    ) {
        return ApiResponse.ok(documentStorageService.createTenantLogoUpload(principal.tenantId(), principal.userId(), request));
    }

    @GetMapping("/logo/{documentId}")
    ResponseEntity<Void> logo(@PathVariable UUID documentId) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, documentStorageService.createTenantLogoReadUrl(documentId))
                .build();
    }
}
