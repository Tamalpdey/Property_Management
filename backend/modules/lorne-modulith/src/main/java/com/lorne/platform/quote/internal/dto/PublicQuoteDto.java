package com.lorne.platform.quote.internal.dto;

public record PublicQuoteDto(
        String companyName,
        String logoUrl,
        String primaryColor,
        String supportEmail,
        String phone,
        QuoteDto quote
) {
}
