package com.lorne.platform.quote.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.*;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ConflictException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuoteTemplateService {
    private final JdbcTemplate jdbc;
    private final AuditWriter audit;
    public QuoteTemplateService(JdbcTemplate jdbc, AuditWriter audit) { this.jdbc = jdbc; this.audit = audit; }

    @Transactional(readOnly = true)
    public List<Template> catalog() {
        return jdbc.query("""
                SELECT q.*, (SELECT count(*)::int FROM tenant_quote_templates a WHERE a.template_code = q.code) AS assignments
                FROM quote_templates q ORDER BY q.code
                """, (rs, row) -> new Template(rs.getString("code"), rs.getString("name"), rs.getString("pricing_mode"),
                rs.getString("default_notes"), rs.getString("default_terms"), rs.getInt("version"), rs.getInt("assignments"), false));
    }

    @Transactional(readOnly = true)
    public List<Template> available(UUID tenantId) {
        requireEnabled(tenantId);
        return jdbc.query("""
                SELECT q.*, a.is_default FROM tenant_quote_templates a JOIN quote_templates q ON q.code = a.template_code
                WHERE a.tenant_id = ? ORDER BY a.is_default DESC, q.code
                """, (rs, row) -> new Template(rs.getString("code"), rs.getString("name"), rs.getString("pricing_mode"),
                rs.getString("default_notes"), rs.getString("default_terms"), rs.getInt("version"), 0, rs.getBoolean("is_default")), tenantId);
    }

    @Transactional
    public Template configure(UUID actor, String code, Configure request) {
        if (request.name() == null || request.name().isBlank() || request.name().trim().length() > 80
                || (request.defaultNotes() != null && request.defaultNotes().length() > 8000)
                || (request.defaultTerms() != null && request.defaultTerms().length() > 8000)) throw new BadRequestException("Enter a template name and valid defaults.");
        if (code == null || !List.of("ITEMIZED", "TOTAL_PRICE").contains(code)) throw new ResourceNotFoundException("Quote template not found.");
        var count = jdbc.update("""
                UPDATE quote_templates SET name = ?, default_notes = ?, default_terms = ?, version = version + 1,
                updated_at = now(), updated_by = ? WHERE code = ? AND version = ?
                """, request.name().trim(), request.defaultNotes(), request.defaultTerms(), actor, code, request.version());
        if (count == 0) throw new ConflictException("This template changed. Refresh before saving.");
        audit.record(null, actor, "QUOTE_TEMPLATE_UPDATED", "PLATFORM_TEMPLATE", null, Map.of("code", code, "name", request.name().trim()));
        return catalog().stream().filter(item -> item.code().equals(code)).findFirst().orElseThrow();
    }

    @Transactional(readOnly = true)
    public Assignment assignment(UUID tenantId) {
        requireTenant(tenantId);
        var codes = jdbc.queryForList("SELECT template_code FROM tenant_quote_templates WHERE tenant_id = ? ORDER BY template_code", String.class, tenantId);
        var defaults = jdbc.queryForList("SELECT template_code FROM tenant_quote_templates WHERE tenant_id = ? AND is_default", String.class, tenantId);
        return new Assignment(codes, defaults.isEmpty() ? null : defaults.getFirst());
    }

    @Transactional
    public Assignment assign(UUID tenantId, UUID actor, Assign request) {
        if (request.templateCodes() == null || request.templateCodes().isEmpty() || request.templateCodes().size() > 2
                || request.templateCodes().stream().anyMatch(java.util.Objects::isNull)
                || request.defaultCode() == null
                || new HashSet<>(request.templateCodes()).size() != request.templateCodes().size()
                || !List.of("ITEMIZED", "TOTAL_PRICE").containsAll(request.templateCodes())
                || !request.templateCodes().contains(request.defaultCode())) throw new BadRequestException("Assign at least one quote template and choose an assigned default.");
        if (jdbc.queryForList("SELECT id FROM tenants WHERE id = ? FOR UPDATE", UUID.class, tenantId).isEmpty()) throw new ResourceNotFoundException("Tenant not found.");
        jdbc.update("DELETE FROM tenant_quote_templates WHERE tenant_id = ?", tenantId);
        for (var code : request.templateCodes()) jdbc.update("INSERT INTO tenant_quote_templates(tenant_id,template_code,is_default) VALUES (?, ?, ?)", tenantId, code, code.equals(request.defaultCode()));
        audit.record(tenantId, actor, "TENANT_QUOTE_TEMPLATES_UPDATED", "TENANT", tenantId,
                Map.of("templates", request.templateCodes(), "default", request.defaultCode()));
        return assignment(tenantId);
    }

    public void requireEnabled(UUID tenantId) {
        if (tenantId == null || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM tenant_modules WHERE tenant_id = ? AND module_code = 'QUOTES' AND enabled)", Boolean.class, tenantId))) throw new BadRequestException("Quote management is not enabled for this tenant.");
    }
    private void requireTenant(UUID id) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM tenants WHERE id = ?)", Boolean.class, id))) throw new ResourceNotFoundException("Tenant not found.");
    }
}
