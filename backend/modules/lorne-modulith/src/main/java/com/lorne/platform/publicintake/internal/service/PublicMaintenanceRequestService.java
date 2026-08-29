package com.lorne.platform.publicintake.internal.service;

import com.lorne.platform.publicintake.internal.dto.PublicMaintenanceRequest;
import com.lorne.platform.publicintake.internal.dto.PublicMaintenanceRequestResponse;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicMaintenanceRequestService {
    private static final DateTimeFormatter REQUEST_DATE = DateTimeFormatter.BASIC_ISO_DATE;

    private final JdbcTemplate jdbcTemplate;

    public PublicMaintenanceRequestService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public PublicMaintenanceRequestResponse create(PublicMaintenanceRequest request, String remoteAddr) {
        if (isBlank(request.email()) && isBlank(request.phone())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please provide either an email address or a phone number.");
        }

        var id = UUID.randomUUID();
        var requestCode = generateRequestCode(id);
        jdbcTemplate.update("""
                INSERT INTO public_maintenance_requests (
                    id, request_code, tenant_key, source_domain, source_url, name, email, phone,
                    property_address, service_requested, message, remote_addr
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                id,
                requestCode,
                clean(request.tenantKey()),
                clean(request.sourceDomain()),
                clean(request.sourceUrl()),
                cleanRequired(request.name()),
                clean(request.email()),
                clean(request.phone()),
                cleanRequired(request.propertyAddress()),
                clean(request.serviceRequested()),
                cleanRequired(request.message()),
                clean(remoteAddr)
        );

        return new PublicMaintenanceRequestResponse(id, requestCode, "NEW");
    }

    private String generateRequestCode(UUID id) {
        var date = LocalDate.now(ZoneOffset.UTC).format(REQUEST_DATE);
        var suffix = id.toString().substring(0, 6).toUpperCase(Locale.ROOT);
        return "REQ-" + date + "-" + suffix;
    }

    private String cleanRequired(String value) {
        var cleaned = clean(value);
        if (cleaned == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Please complete the required fields.");
        }
        return cleaned;
    }

    private String clean(String value) {
        if (value == null) {
            return null;
        }
        var cleaned = value.trim();
        return cleaned.isBlank() ? null : cleaned;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
