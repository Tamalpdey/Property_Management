package com.lorne.platform.auth.internal.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_tenant_roles")
public class UserTenantRole {
    @Id
    private UUID id;

    private UUID tenantId;

    @Column(nullable = false)
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", nullable = false)
    private RoleEntity role;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    public UUID tenantId() {
        return tenantId;
    }

    public UUID userId() {
        return userId;
    }

    public RoleEntity role() {
        return role;
    }
}
