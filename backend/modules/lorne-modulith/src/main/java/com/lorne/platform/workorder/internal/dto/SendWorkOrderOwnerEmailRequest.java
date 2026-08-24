package com.lorne.platform.workorder.internal.dto;

public record SendWorkOrderOwnerEmailRequest(
        String note,
        String recipientEmail,
        String ccEmails,
        String bccEmails
) {
}
