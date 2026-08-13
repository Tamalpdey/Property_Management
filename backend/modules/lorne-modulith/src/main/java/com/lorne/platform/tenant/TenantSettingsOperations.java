package com.lorne.platform.tenant;

import java.util.UUID;

public interface TenantSettingsOperations {
    TenantSettingsView settings(UUID tenantId);
}
