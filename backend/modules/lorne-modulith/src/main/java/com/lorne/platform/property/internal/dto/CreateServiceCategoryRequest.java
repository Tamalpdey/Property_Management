package com.lorne.platform.property.internal.dto;

import jakarta.validation.constraints.NotBlank;

public record CreateServiceCategoryRequest(@NotBlank String name) {
}
