package com.lorne.platform.fieldwork.internal.service;

import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.util.Locale;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class WorkerLoginResolver {
    private final JdbcTemplate jdbc;

    public WorkerLoginResolver(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Identity activeWorker(UUID tenantId, UUID userId, String email) {
        var matches = jdbc.query("""
                SELECT w.id, w.user_id, w.status::text AS status,
                       coalesce(nullif(btrim(u.display_name), ''), w.display_name) AS display_name,
                       coalesce(u.email::text, w.email::text) AS email
                FROM workers w LEFT JOIN app_users u ON u.id = w.user_id
                WHERE w.tenant_id = ? AND (w.user_id = ? OR
                    (w.user_id IS NULL AND lower(btrim(w.email::text)) = lower(btrim(?))))
                ORDER BY CASE WHEN w.user_id = ? THEN 0 ELSE 1 END, w.created_at, w.id
                """, (rs, row) -> new Profile(rs.getObject("id", UUID.class), rs.getObject("user_id", UUID.class),
                rs.getString("display_name"), rs.getString("email"), rs.getString("status")), tenantId, userId, email, userId);
        var linked = matches.stream().filter(profile -> userId.equals(profile.userId())).toList();
        var candidates = linked.isEmpty() ? matches : linked;
        if (candidates.isEmpty()) throw new ResourceNotFoundException("No worker profile is linked to this login in this company. Ask your administrator to link the profile assigned to your work orders under Users.");
        if (candidates.size() > 1) throw new BadRequestException("Multiple worker profiles match this login. Ask your administrator to select the profile assigned to your work orders under Users.");
        var profile = candidates.getFirst();
        if (!"ACTIVE".equals(profile.status())) throw new BadRequestException("Worker profile \"" + profile.name() + "\" is "
                + profile.status().toLowerCase(Locale.ROOT).replace('_', ' ')
                + ". Your administrator must activate this existing profile under Workers before jobs are available.");
        return new Identity(profile.id(), userId, profile.name(), profile.email());
    }

    public record Identity(UUID id, UUID userId, String name, String email) { }
    private record Profile(UUID id, UUID userId, String name, String email, String status) { }
}
