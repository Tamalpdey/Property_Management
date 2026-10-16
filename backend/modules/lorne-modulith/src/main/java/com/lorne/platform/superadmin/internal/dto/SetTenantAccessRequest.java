package com.lorne.platform.superadmin.internal.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SetTenantAccessRequest(boolean active, @NotBlank @Size(min = 10, max = 1000) String reason) { }
