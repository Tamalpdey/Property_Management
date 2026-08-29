package com.lorne.platform.auth.internal.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "app_users")
public class UserAccount {
    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String displayName;

    private String profilePhotoUrl;

    private String phone;

    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(nullable = false, columnDefinition = "user_status")
    private UserStatus status;

    private Instant lastLoginAt;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    @Column(nullable = false)
    private Instant updatedAt;

    public UUID id() {
        return id;
    }

    public String email() {
        return email;
    }

    public String displayName() {
        return displayName;
    }

    public String profilePhotoUrl() {
        return profilePhotoUrl;
    }

    public String passwordHash() {
        return passwordHash;
    }

    public UserStatus status() {
        return status;
    }

    public void recordSuccessfulLogin() {
        lastLoginAt = Instant.now();
        updatedAt = lastLoginAt;
    }
}
