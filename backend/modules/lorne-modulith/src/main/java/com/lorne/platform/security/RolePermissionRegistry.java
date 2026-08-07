package com.lorne.platform.security;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class RolePermissionRegistry {
    private final Map<LorneRole, Set<LornePermission>> permissionsByRole = new EnumMap<>(LorneRole.class);

    public RolePermissionRegistry() {
        permissionsByRole.put(LorneRole.SUPER_ADMIN, EnumSet.allOf(LornePermission.class));
        permissionsByRole.put(LorneRole.TENANT_ADMIN, EnumSet.of(
                LornePermission.MANAGE_PROPERTIES,
                LornePermission.MANAGE_WORKERS,
                LornePermission.CREATE_WORK_ORDERS,
                LornePermission.ASSIGN_WORKERS,
                LornePermission.APPROVE_WORK,
                LornePermission.VIEW_FINANCE,
                LornePermission.MANAGE_PAYROLL
        ));
        permissionsByRole.put(LorneRole.OPERATIONS, EnumSet.of(
                LornePermission.MANAGE_PROPERTIES,
                LornePermission.CREATE_WORK_ORDERS,
                LornePermission.ASSIGN_WORKERS,
                LornePermission.APPROVE_WORK
        ));
        permissionsByRole.put(LorneRole.FINANCE, EnumSet.of(
                LornePermission.VIEW_FINANCE,
                LornePermission.MANAGE_PAYROLL
        ));
        permissionsByRole.put(LorneRole.FIELD_WORKER, EnumSet.of(
                LornePermission.FIELD_WORK,
                LornePermission.UPLOAD_JOB_PHOTOS
        ));
        permissionsByRole.put(LorneRole.CUSTOMER, EnumSet.of(
                LornePermission.VIEW_CUSTOMER_PORTAL
        ));
    }

    public Set<LornePermission> permissionsFor(LorneRole role) {
        return permissionsByRole.getOrDefault(role, Set.of());
    }
}
