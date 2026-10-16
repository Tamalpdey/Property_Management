package com.lorne.platform.quote.internal.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public final class QuoteTemplateDtos {
    private QuoteTemplateDtos() { }
    public record Template(String code, String name, String pricingMode, String defaultNotes, String defaultTerms,
                           int version, int assignedTenants, boolean defaultForTenant) { }
    public record Configure(@NotBlank @Size(max = 80) String name, @Size(max = 8000) String defaultNotes,
                            @Size(max = 8000) String defaultTerms, @Min(0) int version) { }
    public record Assignment(List<String> templateCodes, String defaultCode) { }
    public record Assign(@NotEmpty @Size(max = 2) List<@NotBlank String> templateCodes, @NotBlank String defaultCode) { }
}
