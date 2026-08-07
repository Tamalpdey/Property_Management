package com.lorne.platform.inventory.internal.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateInventoryCategoryRequest(@NotBlank String name) {
}
