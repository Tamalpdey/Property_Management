package com.lorne.platform.fieldwork.internal.dto;

import java.util.List;

public record WorkerTodayResponse(
        WorkerJob nextJob,
        List<WorkerStep> steps,
        List<QuickAction> quickActions
) {
    public record WorkerJob(
            String title,
            String propertyName,
            String address,
            String window,
            String notes,
            List<String> checklist
    ) {
    }

    public record WorkerStep(String key, String label, String icon) {
    }

    public record QuickAction(String label, String icon, String severity) {
    }
}
