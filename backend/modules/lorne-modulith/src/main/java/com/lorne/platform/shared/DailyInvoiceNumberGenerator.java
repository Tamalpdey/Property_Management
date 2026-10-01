package com.lorne.platform.shared;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class DailyInvoiceNumberGenerator {
    private final JdbcTemplate jdbcTemplate;

    public DailyInvoiceNumberGenerator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String next(UUID tenantId, LocalDate invoiceDate) {
        var sequence = jdbcTemplate.queryForObject("""
                INSERT INTO invoice_daily_sequences (tenant_id, invoice_date, last_value)
                VALUES (?, ?, 1)
                ON CONFLICT (tenant_id, invoice_date)
                DO UPDATE SET last_value = invoice_daily_sequences.last_value + 1
                RETURNING last_value
                """, Integer.class, tenantId, invoiceDate);
        return "INV-%s-%04d".formatted(
                invoiceDate.format(DateTimeFormatter.BASIC_ISO_DATE),
                sequence == null ? 1 : sequence
        );
    }
}
