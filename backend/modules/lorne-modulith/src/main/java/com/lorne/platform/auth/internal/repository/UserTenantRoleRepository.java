package com.lorne.platform.auth.internal.repository;

import com.lorne.platform.auth.internal.entity.UserTenantRole;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserTenantRoleRepository extends JpaRepository<UserTenantRole, UUID> {
    @EntityGraph(attributePaths = "role")
    List<UserTenantRole> findByUserId(UUID userId);
}
