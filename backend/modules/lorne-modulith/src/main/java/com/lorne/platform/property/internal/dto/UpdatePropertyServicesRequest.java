package com.lorne.platform.property.internal.dto;

import jakarta.validation.constraints.NotNull;
import java.util.List;
import java.util.UUID;

public record UpdatePropertyServicesRequest(@NotNull List<UUID> serviceTypeIds) {
}
