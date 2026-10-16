package com.lorne.platform.superadmin.internal.dto;

import java.time.Instant;
import java.util.UUID;

public record TenantAdministrationEvent(UUID id, String action, String actorName, String moduleCode, Instant createdAt) { }
