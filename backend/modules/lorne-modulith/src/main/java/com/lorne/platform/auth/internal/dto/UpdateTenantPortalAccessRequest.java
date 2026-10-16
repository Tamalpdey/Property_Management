package com.lorne.platform.auth.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record UpdateTenantPortalAccessRequest(
        @NotNull @Size(max = 3) List<String> portalRoles,
        boolean reactivate,
        @NotBlank @Size(min = 10, max = 1000) String reason
) { }
