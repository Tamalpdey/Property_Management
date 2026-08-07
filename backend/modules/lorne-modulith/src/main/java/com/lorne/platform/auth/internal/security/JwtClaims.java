package com.lorne.platform.auth.internal.security;

final class JwtClaims {
    static final String EMAIL = "email";
    static final String TENANT_ID = "tenantId";
    static final String DISPLAY_NAME = "displayName";
    static final String ROLES = "roles";
    static final String PERMISSIONS = "permissions";
    static final String TYPE = "type";
    static final String ACCESS_TYPE = "access";

    private JwtClaims() {
    }
}
