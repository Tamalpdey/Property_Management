package com.lorne.platform.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RolePermissionRegistryTest {
    private final RolePermissionRegistry registry = new RolePermissionRegistry();

    @Test
    void operationsPermissionsMatchWorkerAndDispatchFeaturesWithoutFinanceAccess() {
        assertThat(registry.permissionsFor(LorneRole.OPERATIONS)).contains(
                LornePermission.MANAGE_WORKERS, LornePermission.MANAGE_PROPERTIES,
                LornePermission.CREATE_WORK_ORDERS, LornePermission.ASSIGN_WORKERS,
                LornePermission.APPROVE_WORK).doesNotContain(LornePermission.VIEW_FINANCE, LornePermission.MANAGE_PAYROLL);
    }

    @Test
    void financeAndFieldWorkerDoNotGainOperationsManagementPermissions() {
        assertThat(registry.permissionsFor(LorneRole.FINANCE)).doesNotContain(LornePermission.MANAGE_WORKERS, LornePermission.ASSIGN_WORKERS);
        assertThat(registry.permissionsFor(LorneRole.FIELD_WORKER)).doesNotContain(LornePermission.MANAGE_WORKERS, LornePermission.ASSIGN_WORKERS, LornePermission.VIEW_FINANCE);
    }
}
