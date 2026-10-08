package com.lorne.platform.tenant.internal.controller;

import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.tenant.internal.service.TenantSettingsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public/tenant-domains")
class PublicTenantDomainController {
    private final TenantSettingsService tenantSettingsService;
    private final LornePublicUrlProperties publicUrlProperties;

    PublicTenantDomainController(TenantSettingsService tenantSettingsService, LornePublicUrlProperties publicUrlProperties) {
        this.tenantSettingsService = tenantSettingsService;
        this.publicUrlProperties = publicUrlProperties;
    }

    @GetMapping("/allow")
    ResponseEntity<Void> allow(@RequestParam String domain) {
        return tenantSettingsService.portalDomainAllowed(domain, publicUrlProperties.rootDomain())
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }
}
