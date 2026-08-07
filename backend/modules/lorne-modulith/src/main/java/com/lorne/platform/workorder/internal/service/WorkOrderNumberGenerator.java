package com.lorne.platform.workorder.internal.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class WorkOrderNumberGenerator {
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.BASIC_ISO_DATE;

    public String nextNumber() {
        var randomPart = UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 6)
                .toUpperCase(Locale.ROOT);
        return "WO-" + LocalDate.now().format(DATE_FORMAT) + "-" + randomPart;
    }
}
