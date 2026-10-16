package com.lorne.platform.support.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ConflictException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.support.internal.dto.SupportTicketDtos.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupportTicketService {
    private static final Set<String> STATUSES = Set.of("OPEN", "IN_PROGRESS", "WAITING_ON_TENANT", "RESOLVED", "CLOSED");
    private static final Set<String> PRIORITIES = Set.of("LOW", "NORMAL", "HIGH", "URGENT");
    private static final Set<String> CATEGORIES = Set.of("ACCESS", "SETUP", "WORK_ORDERS", "INVOICING", "QUOTES", "BUG", "OTHER");
    private static final String SELECT = """
            SELECT st.*, t.display_name AS tenant_name, owner.display_name AS owner_name, creator.display_name AS creator_name
            FROM support_tickets st JOIN tenants t ON t.id = st.tenant_id
            LEFT JOIN app_users owner ON owner.id = st.assigned_to LEFT JOIN app_users creator ON creator.id = st.created_by
            """;
    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    public SupportTicketService(JdbcTemplate jdbc, AuditWriter audit) { this.jdbc = jdbc; this.audit = audit; }

    @Transactional(readOnly = true)
    public Page list(UUID tenantId, String status, String priority, String query, int page, int size) {
        if (page < 0 || page > 100000 || size < 1 || size > 100) throw new BadRequestException("Invalid ticket page.");
        var where = new StringBuilder(" WHERE true");
        var args = new ArrayList<Object>();
        if (tenantId != null) { where.append(" AND st.tenant_id = ?"); args.add(tenantId); }
        if (status != null && !status.isBlank()) {
            if (status.equals("UNRESOLVED")) where.append(" AND st.status NOT IN ('RESOLVED','CLOSED')");
            else { validate(STATUSES, status, "status"); where.append(" AND st.status = ?"); args.add(status); }
        }
        if (priority != null && !priority.isBlank()) { validate(PRIORITIES, priority, "priority"); where.append(" AND st.priority = ?"); args.add(priority); }
        if (query != null && !query.isBlank()) {
            if (query.length() > 200) throw new BadRequestException("Search is limited to 200 characters.");
            where.append(" AND concat_ws(' ', st.subject, 'SUP-' || lpad(st.ticket_number::text, greatest(6, length(st.ticket_number::text)), '0'), t.display_name) ILIKE ? ESCAPE '\\'");
            args.add("%" + query.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        var total = jdbc.queryForObject("SELECT count(*) FROM support_tickets st JOIN tenants t ON t.id = st.tenant_id" + where, Long.class, args.toArray());
        args.add(size); args.add((long) page * size);
        var items = jdbc.query(SELECT + where + " ORDER BY st.updated_at DESC, st.id DESC LIMIT ? OFFSET ?", ticketMapper(), args.toArray());
        return new Page(items, total == null ? 0 : total, page, size);
    }

    @Transactional(readOnly = true)
    public Detail detail(UUID tenantId, UUID ticketId, boolean platform) {
        if (!platform && tenantId == null) throw new AccessDeniedException("Tenant scope is required.");
        var ticket = ticket(tenantId, ticketId);
        var messages = jdbc.query("""
                SELECT m.*, u.display_name AS author_name FROM support_ticket_messages m
                LEFT JOIN app_users u ON u.id = m.author_user_id
                WHERE m.ticket_id = ? AND m.tenant_id = ? AND (? OR m.internal = false)
                ORDER BY m.created_at, m.id
                """, (rs, row) -> new Message(rs.getObject("id", UUID.class), rs.getString("body"), rs.getString("author_name"),
                rs.getString("author_type"), rs.getBoolean("internal"), rs.getTimestamp("created_at").toInstant()), ticketId, ticket.tenantId(), platform);
        return new Detail(ticket, messages);
    }

    @Transactional
    public Detail create(UUID tenantId, UUID actor, Create request) {
        requireTenantActor(tenantId, actor);
        var subject = text(request.subject(), 160); var description = text(request.description(), 8000);
        validate(CATEGORIES, request.category(), "category"); validate(PRIORITIES, request.priority(), "priority");
        var id = jdbc.queryForObject("""
                INSERT INTO support_tickets(tenant_id,subject,description,category,priority,created_by)
                VALUES (?, ?, ?, ?, ?, ?) RETURNING id
                """, UUID.class, tenantId, subject, description, request.category(), request.priority(), actor);
        audit.record(tenantId, actor, "SUPPORT_TICKET_CREATED", "SUPPORT_TICKET", id, Map.of("subject", subject));
        return detail(tenantId, id, false);
    }

    @Transactional
    public Detail reply(UUID tenantId, UUID actor, UUID ticketId, String value, boolean platform, boolean internal) {
        if (platform) requirePlatformActor(actor); else requireTenantActor(tenantId, actor);
        if (!platform && internal) throw new AccessDeniedException("Internal support notes are restricted.");
        var body = text(value, 8000);
        var ticket = lock(tenantId, ticketId);
        jdbc.update("""
                INSERT INTO support_ticket_messages(ticket_id,tenant_id,author_user_id,author_type,body,internal)
                VALUES (?, ?, ?, ?, ?, ?)
                """, ticketId, ticket.tenantId(), actor, platform ? "SUPPORT" : "TENANT", body, internal);
        var status = !platform && Set.of("WAITING_ON_TENANT", "RESOLVED", "CLOSED").contains(ticket.status()) ? "OPEN" : ticket.status();
        if (platform && !internal && status.equals("OPEN")) status = "IN_PROGRESS";
        jdbc.update("UPDATE support_tickets SET status = ?, version = version + 1, updated_at = now(), resolved_at = CASE WHEN ? IN ('RESOLVED','CLOSED') THEN resolved_at ELSE NULL END WHERE id = ?",
                status, status, ticketId);
        audit.record(ticket.tenantId(), actor, internal ? "SUPPORT_INTERNAL_NOTE_ADDED" : "SUPPORT_TICKET_REPLIED",
                internal ? "PLATFORM_SUPPORT" : "SUPPORT_TICKET", ticketId, Map.of("status", status));
        return detail(ticket.tenantId(), ticketId, platform);
    }

    @Transactional
    public Detail update(UUID actor, UUID ticketId, Update request) {
        requirePlatformActor(actor);
        validate(STATUSES, request.status(), "status"); validate(PRIORITIES, request.priority(), "priority");
        var ticket = lock(null, ticketId);
        if (ticket.version() != request.version()) throw new ConflictException("This ticket has changed. Refresh the ticket before saving.");
        if (request.assignedTo() != null && agents().stream().noneMatch(agent -> agent.id().equals(request.assignedTo()))) {
            throw new BadRequestException("Assign tickets only to an active platform administrator.");
        }
        jdbc.update("""
                UPDATE support_tickets SET status = ?, priority = ?, assigned_to = ?, version = version + 1,
                updated_at = now(), resolved_at = CASE WHEN ? IN ('RESOLVED','CLOSED') THEN coalesce(resolved_at, now()) ELSE NULL END WHERE id = ?
                """, request.status(), request.priority(), request.assignedTo(), request.status(), ticketId);
        audit.record(ticket.tenantId(), actor, "SUPPORT_TICKET_UPDATED", "SUPPORT_TICKET", ticketId,
                Map.of("previousStatus", ticket.status(), "status", request.status(), "priority", request.priority(), "assignedTo", request.assignedTo() == null ? "" : request.assignedTo().toString()));
        return detail(ticket.tenantId(), ticketId, true);
    }

    @Transactional
    public Detail close(UUID tenantId, UUID actor, UUID ticketId, int version) {
        requireTenantActor(tenantId, actor);
        var ticket = lock(tenantId, ticketId);
        if (ticket.version() != version) throw new ConflictException("This ticket has changed. Refresh the ticket before closing it.");
        jdbc.update("UPDATE support_tickets SET status = 'CLOSED', version = version + 1, updated_at = now(), resolved_at = coalesce(resolved_at, now()) WHERE id = ?", ticketId);
        audit.record(tenantId, actor, "SUPPORT_TICKET_CLOSED", "SUPPORT_TICKET", ticketId, Map.of());
        return detail(tenantId, ticketId, false);
    }

    @Transactional(readOnly = true)
    public List<Agent> agents() {
        return jdbc.query("""
                SELECT DISTINCT u.id, u.display_name, u.email::text AS email FROM app_users u
                JOIN user_tenant_roles utr ON utr.user_id = u.id AND utr.tenant_id IS NULL
                JOIN roles r ON r.id = utr.role_id AND r.code = 'SUPER_ADMIN'
                WHERE u.status = 'ACTIVE' ORDER BY u.display_name
                """, (rs, row) -> new Agent(rs.getObject("id", UUID.class), rs.getString("display_name"), rs.getString("email")));
    }

    private Ticket lock(UUID tenantId, UUID id) {
        var ids = tenantId == null
                ? jdbc.queryForList("SELECT id FROM support_tickets WHERE id = ? FOR UPDATE", UUID.class, id)
                : jdbc.queryForList("SELECT id FROM support_tickets WHERE id = ? AND tenant_id = ? FOR UPDATE", UUID.class, id, tenantId);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Support ticket not found.");
        return ticket(tenantId, id);
    }
    private Ticket ticket(UUID tenantId, UUID id) {
        var items = jdbc.query(SELECT + " WHERE st.id = ? AND (?::uuid IS NULL OR st.tenant_id = ?)", ticketMapper(), id, tenantId, tenantId);
        return items.stream().findFirst().orElseThrow(() -> new ResourceNotFoundException("Support ticket not found."));
    }
    private RowMapper<Ticket> ticketMapper() {
        return (rs, row) -> new Ticket(rs.getObject("id", UUID.class), rs.getObject("tenant_id", UUID.class), rs.getString("tenant_name"),
                String.format(Locale.ROOT, "SUP-%06d", rs.getLong("ticket_number")), rs.getString("subject"), rs.getString("description"),
                rs.getString("category"), rs.getString("priority"), rs.getString("status"), rs.getObject("assigned_to", UUID.class),
                rs.getString("owner_name"), rs.getString("creator_name"), rs.getInt("version"), rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("updated_at").toInstant(), rs.getTimestamp("resolved_at") == null ? null : rs.getTimestamp("resolved_at").toInstant());
    }
    private void requireTenantActor(UUID tenantId, UUID userId) {
        if (tenantId == null || !Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM user_tenant_roles utr JOIN roles r ON r.id = utr.role_id
                JOIN app_users u ON u.id = utr.user_id AND u.status = 'ACTIVE'
                JOIN tenants t ON t.id = utr.tenant_id AND t.status IN ('ACTIVE','TRIAL','PAST_DUE')
                WHERE utr.tenant_id = ? AND utr.user_id = ? AND r.code IN ('TENANT_ADMIN','OPERATIONS','FINANCE'))
                """, Boolean.class, tenantId, userId))) throw new AccessDeniedException("Active tenant portal access is required.");
    }
    private void requirePlatformActor(UUID userId) {
        if (agents().stream().noneMatch(agent -> agent.id().equals(userId))) throw new AccessDeniedException("Active platform administrator access is required.");
    }
    private void validate(Set<String> choices, String value, String field) {
        if (value == null || !choices.contains(value)) throw new BadRequestException("Invalid support ticket " + field + ".");
    }
    private String text(String value, int max) {
        var result = value == null ? "" : value.trim();
        if (result.isEmpty() || result.length() > max) throw new BadRequestException("Enter text between 1 and " + max + " characters.");
        return result;
    }
}
