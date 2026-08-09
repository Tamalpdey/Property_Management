package com.lorne.platform.workorder.internal.dto;

import jakarta.validation.constraints.NotBlank;

public record CancelWorkOrderRequest(@NotBlank String reason) {
}
