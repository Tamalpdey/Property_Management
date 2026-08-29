package com.lorne.platform.publicintake.internal.dto;

import java.util.UUID;

public record PublicMaintenanceRequestResponse(
        UUID id,
        String requestCode,
        String status
) {
}
