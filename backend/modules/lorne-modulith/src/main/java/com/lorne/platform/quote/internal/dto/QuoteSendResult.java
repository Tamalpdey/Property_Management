package com.lorne.platform.quote.internal.dto;

import java.time.Instant;

public record QuoteSendResult(String status, String recipient, Instant sentAt, String publicUrl) {
}
