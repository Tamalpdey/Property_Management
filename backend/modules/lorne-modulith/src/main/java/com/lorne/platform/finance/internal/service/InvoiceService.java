package com.lorne.platform.finance.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.finance.internal.dto.InvoiceDto;
import com.lorne.platform.finance.internal.dto.InvoiceLineRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailResponse;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InvoiceService {
    private final JdbcTemplate jdbcTemplate;
    private final InvoiceEmailService invoiceEmailService;
    private final InvoicePdfService invoicePdfService;
    private final AuditWriter auditWriter;

    public InvoiceService(
            JdbcTemplate jdbcTemplate,
            InvoiceEmailService invoiceEmailService,
            InvoicePdfService invoicePdfService,
            AuditWriter auditWriter
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.invoiceEmailService = invoiceEmailService;
        this.invoicePdfService = invoicePdfService;
        this.auditWriter = auditWriter;
    }

    @Transactional(readOnly = true)
    public List<InvoiceDto> list(UUID tenantId) {
        var invoices = invoiceHeaders(tenantId, null);
        attachLines(tenantId, invoices);
        return new ArrayList<>(invoices.values());
    }

    @Transactional(readOnly = true)
    public InvoiceDto get(UUID tenantId, UUID invoiceId) {
        var invoices = invoiceHeaders(tenantId, invoiceId);
        attachLines(tenantId, invoices);
        var invoice = invoices.get(invoiceId);
        if (invoice == null) {
            throw new ResourceNotFoundException("Invoice not found.");
        }
        return invoice;
    }

    @Transactional
    public SendInvoiceEmailResponse sendInvoice(UUID tenantId, UUID actorUserId, UUID invoiceId, SendInvoiceEmailRequest request) {
        return invoiceEmailService.sendInvoice(tenantId, actorUserId, get(tenantId, invoiceId), request);
    }

    @Transactional
    public byte[] pdf(UUID tenantId, UUID actorUserId, UUID invoiceId) {
        var invoice = get(tenantId, invoiceId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_PDF_DOWNLOADED", "INVOICE", invoice.id(), Map.of(
                "invoiceNumber", invoice.invoiceNumber(),
                "ownerName", invoice.ownerName(),
                "total", invoice.total()
        ));
        return invoicePdfService.generate(invoice);
    }

    @Transactional
    public InvoiceDto addLine(UUID tenantId, UUID actorUserId, UUID invoiceId, InvoiceLineRequest request) {
        requireDraftInvoice(tenantId, invoiceId);
        var description = description(request);
        var quantity = positiveMoney(request.quantity(), "Quantity must be greater than zero.");
        var unitPrice = money(request.unitPrice());
        var lineTotal = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
        var lineId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO invoice_lines (
                    id, tenant_id, invoice_id, description, quantity, unit_price, line_total, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, lineId, tenantId, invoiceId, description, quantity, unitPrice, lineTotal, actorUserId, actorUserId);
        recalculateTotals(tenantId, invoiceId, actorUserId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_LINE_ADDED", "INVOICE", invoiceId, Map.of(
                "lineId", lineId.toString(),
                "description", description,
                "quantity", quantity,
                "unitPrice", unitPrice,
                "lineTotal", lineTotal
        ));
        return get(tenantId, invoiceId);
    }

    @Transactional
    public InvoiceDto deleteLine(UUID tenantId, UUID actorUserId, UUID invoiceId, UUID lineId) {
        requireDraftInvoice(tenantId, invoiceId);
        var deleted = jdbcTemplate.update("""
                DELETE FROM invoice_lines
                WHERE tenant_id = ? AND invoice_id = ? AND id = ?
                """, tenantId, invoiceId, lineId);
        if (deleted == 0) {
            throw new ResourceNotFoundException("Invoice line not found.");
        }
        recalculateTotals(tenantId, invoiceId, actorUserId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_LINE_DELETED", "INVOICE", invoiceId, Map.of(
                "lineId", lineId.toString()
        ));
        return get(tenantId, invoiceId);
    }

    private LinkedHashMap<UUID, InvoiceDto> invoiceHeaders(UUID tenantId, UUID invoiceId) {
        var sql = """
                SELECT i.id, i.invoice_number, i.status::text AS status, i.issued_on, i.due_on,
                       i.subtotal, i.tax_total, i.total, i.customer_id,
                       c.display_name AS owner_name, c.email AS owner_email, c.billing_email AS owner_billing_email,
                       wo.id AS work_order_id, wo.work_order_number, wo.title AS work_order_title,
                       p.name AS property_name,
                       trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address,
                       i.created_at
                FROM invoices i
                JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
                LEFT JOIN work_orders wo ON wo.id = i.work_order_id AND wo.tenant_id = i.tenant_id
                LEFT JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                WHERE i.tenant_id = ?
                  AND (?::uuid IS NULL OR i.id = ?)
                ORDER BY i.created_at DESC
                """;
        var invoices = new LinkedHashMap<UUID, InvoiceDto>();
        jdbcTemplate.query(sql, rs -> {
            var invoice = mapInvoice(rs, List.of());
            invoices.put(invoice.id(), invoice);
        }, tenantId, invoiceId, invoiceId);
        return invoices;
    }

    private void attachLines(UUID tenantId, LinkedHashMap<UUID, InvoiceDto> invoices) {
        if (invoices.isEmpty()) {
            return;
        }
        for (var invoiceId : invoices.keySet()) {
            var lines = jdbcTemplate.query("""
                    SELECT id, description, quantity, unit_price, line_total
                    FROM invoice_lines
                    WHERE tenant_id = ? AND invoice_id = ?
                    ORDER BY created_at, description
                    """, (rs, rowNum) -> new InvoiceDto.InvoiceLineDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("description"),
                    rs.getBigDecimal("quantity"),
                    rs.getBigDecimal("unit_price"),
                    rs.getBigDecimal("line_total")
            ), tenantId, invoiceId);
            var invoice = invoices.get(invoiceId);
            invoices.put(invoiceId, new InvoiceDto(
                    invoice.id(),
                    invoice.invoiceNumber(),
                    invoice.status(),
                    invoice.issuedOn(),
                    invoice.dueOn(),
                    invoice.subtotal(),
                    invoice.taxTotal(),
                    invoice.total(),
                    invoice.customerId(),
                    invoice.ownerName(),
                    invoice.ownerEmail(),
                    invoice.ownerBillingEmail(),
                    invoice.workOrderId(),
                    invoice.workOrderNumber(),
                    invoice.workOrderTitle(),
                    invoice.propertyName(),
                    invoice.propertyAddress(),
                    invoice.createdAt(),
                    lines
            ));
        }
    }

    private InvoiceDto mapInvoice(ResultSet rs, List<InvoiceDto.InvoiceLineDto> lines) throws SQLException {
        return new InvoiceDto(
                rs.getObject("id", UUID.class),
                rs.getString("invoice_number"),
                rs.getString("status"),
                localDate("issued_on", rs),
                localDate("due_on", rs),
                rs.getBigDecimal("subtotal"),
                rs.getBigDecimal("tax_total"),
                rs.getBigDecimal("total"),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_name"),
                rs.getString("owner_email"),
                rs.getString("owner_billing_email"),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("work_order_title"),
                rs.getString("property_name"),
                rs.getString("property_address"),
                instant("created_at", rs),
                lines
        );
    }

    private void requireDraftInvoice(UUID tenantId, UUID invoiceId) {
        var status = jdbcTemplate.query("""
                SELECT status::text
                FROM invoices
                WHERE tenant_id = ? AND id = ?
                """, rs -> rs.next() ? rs.getString("status") : null, tenantId, invoiceId);
        if (status == null) {
            throw new ResourceNotFoundException("Invoice not found.");
        }
        if (!"DRAFT".equals(status)) {
            throw new BadRequestException("Only draft invoices can be edited.");
        }
    }

    private void recalculateTotals(UUID tenantId, UUID invoiceId, UUID actorUserId) {
        var subtotal = jdbcTemplate.queryForObject("""
                SELECT coalesce(sum(line_total), 0)
                FROM invoice_lines
                WHERE tenant_id = ? AND invoice_id = ?
                """, BigDecimal.class, tenantId, invoiceId);
        subtotal = money(subtotal);
        var taxTotal = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        var total = subtotal.add(taxTotal).setScale(2, RoundingMode.HALF_UP);
        jdbcTemplate.update("""
                UPDATE invoices
                SET subtotal = ?, tax_total = ?, total = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, subtotal, taxTotal, total, actorUserId, tenantId, invoiceId);
    }

    private String description(InvoiceLineRequest request) {
        var description = request == null || request.description() == null ? "" : request.description().trim();
        if (description.isBlank()) {
            throw new BadRequestException("Line description is required.");
        }
        return description;
    }

    private BigDecimal positiveMoney(BigDecimal value, String message) {
        var amount = money(value);
        if (amount.signum() <= 0) {
            throw new BadRequestException(message);
        }
        return amount;
    }

    private BigDecimal money(BigDecimal value) {
        return (value == null ? BigDecimal.ZERO : value).setScale(2, RoundingMode.HALF_UP);
    }

    private LocalDate localDate(String column, ResultSet rs) throws SQLException {
        var date = rs.getDate(column);
        return date == null ? null : date.toLocalDate();
    }

    private Instant instant(String column, ResultSet rs) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
