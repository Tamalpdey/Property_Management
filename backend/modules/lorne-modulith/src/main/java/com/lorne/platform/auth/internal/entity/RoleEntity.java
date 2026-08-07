package com.lorne.platform.auth.internal.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "roles")
public class RoleEntity {
    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(nullable = false)
    private String displayName;

    @Column(nullable = false)
    private boolean platformRole;

    public UUID id() {
        return id;
    }

    public String code() {
        return code;
    }

    public String displayName() {
        return displayName;
    }

    public boolean platformRole() {
        return platformRole;
    }
}
