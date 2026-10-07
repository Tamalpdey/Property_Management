package com.lorne.platform.workorder.internal.service;

import java.time.LocalDate;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class WorkOrderNumberGenerator {
    private final JdbcTemplate jdbcTemplate;

    public WorkOrderNumberGenerator(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public String nextNumber(UUID tenantId, LocalDate workOrderDate) {
        var sequence = jdbcTemplate.queryForObject("""
                INSERT INTO work_order_daily_sequences (tenant_id, work_order_date, last_value)
                VALUES (?, ?, 1)
                ON CONFLICT (tenant_id, work_order_date)
                DO UPDATE SET last_value = work_order_daily_sequences.last_value + 1
                RETURNING last_value
                """, Integer.class, tenantId, workOrderDate);
        return "%s-%04d".formatted(
                workOrderDate.format(java.time.format.DateTimeFormatter.ofPattern("yyMMdd")),
                sequence == null ? 1 : sequence
        );
    }
}
