package com.lorne.platform.notification;

import java.util.Map;
import java.util.UUID;

public interface EmailTemplateOperations {
    String INVOICE_OWNER_TEMPLATE_KEY = "INVOICE_OWNER";
    String WORK_ORDER_COMPLETED_OWNER_TEMPLATE_KEY = "WORK_ORDER_COMPLETED_OWNER";

    EmailTemplateView ensureDefaultInvoiceTemplate(UUID tenantId, UUID actorUserId);

    EmailTemplateView ensureDefaultWorkOrderCompletedTemplate(UUID tenantId, UUID actorUserId);

    EmailTemplateView template(UUID tenantId, String templateKey);

    default String render(String template, Map<String, String> values) {
        var rendered = template == null ? "" : template;
        for (var entry : values.entrySet()) {
            rendered = rendered.replace("{{" + entry.getKey() + "}}", entry.getValue() == null ? "" : entry.getValue());
        }
        return rendered;
    }
}
