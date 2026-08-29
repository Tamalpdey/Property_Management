package com.lorne.platform.finance.internal.service;

import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.finance.internal.dto.CreateBatchInvoiceRequest;
import com.lorne.platform.finance.internal.dto.InvoiceDto;
import com.lorne.platform.finance.internal.dto.InvoiceLineRequest;
import com.lorne.platform.finance.internal.dto.OwnerStatementDto;
import com.lorne.platform.finance.internal.dto.RecordPaymentRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailRequest;
import com.lorne.platform.finance.internal.dto.SendInvoiceEmailResponse;
import com.lorne.platform.finance.internal.dto.UpdateInvoiceStatusRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private final TenantSettingsOperations tenantSettingsOperations;

    public InvoiceService(
            JdbcTemplate jdbcTemplate,
            InvoiceEmailService invoiceEmailService,
            InvoicePdfService invoicePdfService,
            AuditWriter auditWriter,
            TenantSettingsOperations tenantSettingsOperations
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.invoiceEmailService = invoiceEmailService;
        this.invoicePdfService = invoicePdfService;
        this.auditWriter = auditWriter;
        this.tenantSettingsOperations = tenantSettingsOperations;
    }

    @Transactional(readOnly = true)
    public List<InvoiceDto> list(UUID tenantId) {
        var invoices = invoiceHeaders(tenantId, null);
        attachWorkOrders(tenantId, invoices);
        attachLines(tenantId, invoices);
        return new ArrayList<>(invoices.values());
    }

    @Transactional(readOnly = true)
    public InvoiceDto get(UUID tenantId, UUID invoiceId) {
        var invoices = invoiceHeaders(tenantId, invoiceId);
        attachWorkOrders(tenantId, invoices);
        attachLines(tenantId, invoices);
        var invoice = invoices.get(invoiceId);
        if (invoice == null) {
            throw new ResourceNotFoundException("Invoice not found.");
        }
        return invoice;
    }

    @Transactional(readOnly = true)
    public OwnerStatementDto ownerStatement(UUID tenantId, UUID ownerId) {
        var owner = jdbcTemplate.query("""
                SELECT id, display_name, email, billing_email
                FROM customers
                WHERE tenant_id = ? AND id = ?
                """, rs -> {
            if (!rs.next()) {
                return null;
            }
            return new OwnerRef(
                    rs.getObject("id", UUID.class),
                    rs.getString("display_name"),
                    rs.getString("email"),
                    rs.getString("billing_email")
            );
        }, tenantId, ownerId);
        if (owner == null) {
            throw new ResourceNotFoundException("Owner not found.");
        }
        var invoices = invoiceHeadersForOwner(tenantId, ownerId);
        attachWorkOrders(tenantId, invoices);
        attachLines(tenantId, invoices);
        var records = new ArrayList<>(invoices.values());
        var invoicedTotal = records.stream()
                .filter(invoice -> !"VOID".equals(invoice.status()))
                .map(InvoiceDto::total)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        var paidTotal = records.stream()
                .map(InvoiceDto::paidTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        var balanceDue = records.stream()
                .filter(invoice -> !"VOID".equals(invoice.status()))
                .map(InvoiceDto::balanceDue)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        return new OwnerStatementDto(owner.id(), owner.name(), owner.email(), owner.billingEmail(), invoicedTotal, paidTotal, balanceDue, records);
    }

    @Transactional
    public SendInvoiceEmailResponse sendInvoice(UUID tenantId, UUID actorUserId, UUID invoiceId, SendInvoiceEmailRequest request) {
        return invoiceEmailService.sendInvoice(tenantId, actorUserId, get(tenantId, invoiceId), request);
    }

    @Transactional
    public InvoiceDto createBatch(UUID tenantId, UUID actorUserId, CreateBatchInvoiceRequest request) {
        var safeRequest = request == null ? new CreateBatchInvoiceRequest(null, null, List.of(), List.of(), null, null) : request;
        if (safeRequest.ownerId() == null) {
            throw new BadRequestException("Owner is required.");
        }
        var workOrderIds = safeRequest.workOrderIds() == null ? List.<UUID>of() : safeRequest.workOrderIds().stream()
                .filter(id -> id != null)
                .distinct()
                .toList();
        if (workOrderIds.isEmpty()) {
            throw new BadRequestException("Select at least one work order.");
        }
        var workOrders = invoiceWorkOrders(tenantId, safeRequest.ownerId(), safeRequest.propertyId(), workOrderIds);
        if (workOrders.size() != workOrderIds.size()) {
            throw new BadRequestException("One or more selected work orders are not valid for this owner or property.");
        }
        var notReady = workOrders.stream()
                .filter(workOrder -> !Set.of("APPROVED", "CUSTOMER_NOTIFIED").contains(workOrder.status()))
                .toList();
        if (!notReady.isEmpty()) {
            throw new BadRequestException("Only approved or customer-notified work orders can be invoiced.");
        }
        var alreadyInvoiced = jdbcTemplate.queryForList("""
                SELECT iwo.work_order_id
                FROM invoice_work_orders iwo
                JOIN invoices i ON i.id = iwo.invoice_id AND i.tenant_id = iwo.tenant_id
                WHERE iwo.tenant_id = ?
                  AND iwo.work_order_id IN (%s)
                  AND i.status <> 'VOID'
                UNION
                SELECT i.work_order_id
                FROM invoices i
                WHERE i.tenant_id = ?
                  AND i.work_order_id IN (%s)
                  AND i.status <> 'VOID'
                """.formatted(placeholders(workOrderIds), placeholders(workOrderIds)), UUID.class, args(tenantId, workOrderIds, tenantId, workOrderIds));
        if (!alreadyInvoiced.isEmpty()) {
            throw new BadRequestException("One or more selected work orders already belong to an invoice.");
        }

        var issuedOn = safeRequest.issuedOn() == null ? LocalDate.now() : safeRequest.issuedOn();
        var dueOn = safeRequest.dueOn() == null ? issuedOn.plusDays(30) : safeRequest.dueOn();
        if (dueOn.isBefore(issuedOn)) {
            throw new BadRequestException("Due date must be on or after invoice date.");
        }

        var invoiceId = UUID.randomUUID();
        var invoiceNumber = invoiceNumber();
        var primaryWorkOrder = workOrders.getFirst();
        jdbcTemplate.update("""
                INSERT INTO invoices (
                    id, tenant_id, customer_id, work_order_id, invoice_number, status,
                    issued_on, due_on, subtotal, tax_total, total, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, 'DRAFT'::invoice_status, ?, ?, 0, 0, 0, ?, ?)
                """, invoiceId, tenantId, safeRequest.ownerId(), primaryWorkOrder.id(), invoiceNumber, issuedOn, dueOn, actorUserId, actorUserId);

        for (var workOrder : workOrders) {
            jdbcTemplate.update("""
                    INSERT INTO invoice_work_orders (tenant_id, invoice_id, work_order_id, created_by)
                    VALUES (?, ?, ?, ?)
                    """, tenantId, invoiceId, workOrder.id(), actorUserId);
            for (var line : invoiceLines(tenantId, workOrder)) {
                insertLine(tenantId, actorUserId, invoiceId, invoiceLineType(line.sourceType()), line.description(), line.quantity(), line.unitPrice(), false, BigDecimal.ZERO);
            }
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'INVOICED'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ?
                    """, actorUserId, tenantId, workOrder.id());
        }

        var additionalLines = safeRequest.additionalLines() == null ? List.<InvoiceLineRequest>of() : safeRequest.additionalLines();
        var addedManualLines = 0;
        for (var line : additionalLines) {
            if (line == null || text(line.description()) == null) {
                continue;
            }
            var lineType = lineType(line);
            var unitPrice = money(line.unitPrice());
            if (!"DISCOUNT".equals(lineType) && unitPrice.signum() < 0) {
                throw new BadRequestException("Only discount lines can have a negative unit price.");
            }
            insertLine(
                    tenantId,
                    actorUserId,
                    invoiceId,
                    lineType,
                    description(line),
                    positiveMoney(line.quantity(), "Quantity must be greater than zero."),
                    unitPrice,
                    Boolean.TRUE.equals(line.taxable()),
                    rate(line.taxRate())
            );
            addedManualLines++;
        }
        recalculateTotals(tenantId, invoiceId, actorUserId);
        auditWriter.record(tenantId, actorUserId, "BATCH_INVOICE_CREATED", "INVOICE", invoiceId, Map.of(
                "invoiceNumber", invoiceNumber,
                "ownerId", safeRequest.ownerId().toString(),
                "propertyId", safeRequest.propertyId() == null ? "" : safeRequest.propertyId().toString(),
                "workOrderCount", workOrders.size(),
                "workOrderNumbers", workOrders.stream().map(InvoiceWorkOrderDraft::workOrderNumber).toList(),
                "additionalLineCount", addedManualLines
        ));
        return get(tenantId, invoiceId);
    }

    @Transactional
    public byte[] pdf(UUID tenantId, UUID actorUserId, UUID invoiceId) {
        var invoice = get(tenantId, invoiceId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_PDF_DOWNLOADED", "INVOICE", invoice.id(), Map.of(
                "invoiceNumber", invoice.invoiceNumber(),
                "ownerName", invoice.ownerName(),
                "total", invoice.total()
        ));
        return invoicePdfService.generate(invoice, tenantId, tenantSettingsOperations.settings(tenantId));
    }

    @Transactional
    public InvoiceDto addLine(UUID tenantId, UUID actorUserId, UUID invoiceId, InvoiceLineRequest request) {
        requireDraftInvoice(tenantId, invoiceId);
        var lineType = lineType(request);
        var description = description(request);
        var quantity = positiveMoney(request.quantity(), "Quantity must be greater than zero.");
        var unitPrice = money(request.unitPrice());
        if (!"DISCOUNT".equals(lineType) && unitPrice.signum() < 0) {
            throw new BadRequestException("Only discount lines can have a negative unit price.");
        }
        var lineTotal = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
        var taxable = Boolean.TRUE.equals(request.taxable());
        var taxRate = rate(request.taxRate());
        var lineId = insertLine(tenantId, actorUserId, invoiceId, lineType, description, quantity, unitPrice, taxable, taxRate);
        recalculateTotals(tenantId, invoiceId, actorUserId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_LINE_ADDED", "INVOICE", invoiceId, Map.of(
                "lineId", lineId.toString(),
                "lineType", lineType,
                "description", description,
                "quantity", quantity,
                "unitPrice", unitPrice,
                "lineTotal", lineTotal,
                "taxable", taxable,
                "taxRate", taxRate
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

    @Transactional
    public InvoiceDto updateLine(UUID tenantId, UUID actorUserId, UUID invoiceId, UUID lineId, InvoiceLineRequest request) {
        var invoice = get(tenantId, invoiceId);
        requireDraftInvoice(tenantId, invoiceId);
        var before = lineSnapshot(tenantId, invoiceId, lineId);
        var lineType = lineType(request);
        var description = description(request);
        var quantity = positiveMoney(request.quantity(), "Quantity must be greater than zero.");
        var unitPrice = money(request.unitPrice());
        if (!"DISCOUNT".equals(lineType) && unitPrice.signum() < 0) {
            throw new BadRequestException("Only discount lines can have a negative unit price.");
        }
        var taxable = Boolean.TRUE.equals(request.taxable());
        var taxRate = rate(request.taxRate());
        var lineTotal = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
        var changed = jdbcTemplate.update("""
                UPDATE invoice_lines
                SET line_type = ?,
                    description = ?,
                    quantity = ?,
                    unit_price = ?,
                    line_total = ?,
                    taxable = ?,
                    tax_rate = ?,
                    updated_by = ?,
                    updated_at = now()
                WHERE tenant_id = ? AND invoice_id = ? AND id = ?
                """,
                lineType,
                description,
                quantity,
                unitPrice,
                lineTotal,
                taxable,
                taxRate,
                actorUserId,
                tenantId,
                invoiceId,
                lineId
        );
        if (changed == 0) {
            throw new ResourceNotFoundException("Invoice line not found.");
        }
        recalculateTotals(tenantId, invoiceId, actorUserId);
        var metadata = new LinkedHashMap<String, Object>();
        metadata.put("invoiceNumber", invoice.invoiceNumber());
        metadata.put("lineId", lineId.toString());
        metadata.put("changedFields", changedLineFields(before, lineType, description, quantity, unitPrice, taxable, taxRate));
        metadata.put("beforeLineType", before.lineType());
        metadata.put("afterLineType", lineType);
        metadata.put("beforeDescription", before.description());
        metadata.put("afterDescription", description);
        metadata.put("beforeQuantity", before.quantity());
        metadata.put("afterQuantity", quantity);
        metadata.put("beforeUnitPrice", before.unitPrice());
        metadata.put("afterUnitPrice", unitPrice);
        metadata.put("beforeTaxable", before.taxable());
        metadata.put("afterTaxable", taxable);
        metadata.put("beforeTaxRate", before.taxRate());
        metadata.put("afterTaxRate", taxRate);
        metadata.put("beforeLineTotal", before.lineTotal());
        metadata.put("afterLineTotal", lineTotal);
        auditWriter.record(tenantId, actorUserId, "INVOICE_LINE_UPDATED", "INVOICE", invoiceId, metadata);
        return get(tenantId, invoiceId);
    }

    @Transactional
    public InvoiceDto updateStatus(UUID tenantId, UUID actorUserId, UUID invoiceId, UpdateInvoiceStatusRequest request) {
        var invoice = get(tenantId, invoiceId);
        var status = normalizeStatus(request == null ? null : request.status());
        if ("PAID".equals(status) && invoice.balanceDue().signum() > 0) {
            throw new BadRequestException("Record the remaining payment before marking this invoice paid.");
        }
        if ("VOID".equals(status) && invoice.paidTotal().signum() > 0) {
            throw new BadRequestException("Invoices with received payments cannot be voided.");
        }
        if ("SENT".equals(status) && invoice.lines().isEmpty()) {
            throw new BadRequestException("Add at least one invoice line before sending.");
        }
        var changed = jdbcTemplate.update("""
                UPDATE invoices
                SET status = ?::invoice_status,
                    issued_on = CASE WHEN ? = 'SENT' AND issued_on IS NULL THEN current_date ELSE issued_on END,
                    updated_by = ?,
                    updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, status, status, actorUserId, tenantId, invoiceId);
        if (changed == 0) {
            throw new ResourceNotFoundException("Invoice not found.");
        }
        auditWriter.record(tenantId, actorUserId, "INVOICE_STATUS_UPDATED", "INVOICE", invoiceId, Map.of(
                "invoiceNumber", invoice.invoiceNumber(),
                "before", invoice.status(),
                "after", status,
                "reason", request == null || request.reason() == null ? "" : request.reason().trim()
        ));
        syncWorkOrdersFromInvoice(tenantId, actorUserId, invoice.id(), status);
        var updated = get(tenantId, invoiceId);
        if ("SENT".equals(status) && tenantSettingsOperations.settings(tenantId).autoSendInvoiceEmail()) {
            invoiceEmailService.sendInvoice(
                    tenantId,
                    actorUserId,
                    updated,
                    new SendInvoiceEmailRequest(null, null, null, null, null, null, "AUTO")
            );
            return get(tenantId, invoiceId);
        }
        return updated;
    }

    @Transactional
    public InvoiceDto recordPayment(UUID tenantId, UUID actorUserId, UUID invoiceId, RecordPaymentRequest request) {
        var safeRequest = request == null ? new RecordPaymentRequest(null, null, null, null, null) : request;
        var invoice = get(tenantId, invoiceId);
        if ("VOID".equals(invoice.status())) {
            throw new BadRequestException("Payments cannot be recorded against a void invoice.");
        }
        var amount = positiveMoney(safeRequest.amount(), "Payment amount must be greater than zero.");
        if (amount.compareTo(invoice.balanceDue()) > 0) {
            throw new BadRequestException("Payment amount cannot exceed the invoice balance.");
        }
        var paymentMethod = paymentMethod(safeRequest.paymentMethod());
        var paidAt = safeRequest.paidAt() == null ? Instant.now() : safeRequest.paidAt();
        var paymentId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO payments (
                    id, tenant_id, invoice_id, status, amount, payment_method, paid_at, reference, note, created_by, updated_by
                )
                VALUES (?, ?, ?, 'RECEIVED'::payment_status, ?, ?, ?, ?, ?, ?, ?)
                """,
                paymentId,
                tenantId,
                invoiceId,
                amount,
                paymentMethod,
                Timestamp.from(paidAt),
                text(safeRequest.reference()),
                text(safeRequest.note()),
                actorUserId,
                actorUserId
        );
        updateInvoiceStatusFromPayments(tenantId, actorUserId, invoiceId);
        auditWriter.record(tenantId, actorUserId, "INVOICE_PAYMENT_RECORDED", "INVOICE", invoiceId, Map.of(
                "invoiceNumber", invoice.invoiceNumber(),
                "paymentId", paymentId.toString(),
                "amount", amount,
                "paymentMethod", paymentMethod,
                "reference", text(safeRequest.reference()) == null ? "" : text(safeRequest.reference())
        ));
        return get(tenantId, invoiceId);
    }

    private LinkedHashMap<UUID, InvoiceDto> invoiceHeaders(UUID tenantId, UUID invoiceId) {
        var sql = """
                SELECT i.id, i.invoice_number, i.status::text AS status, i.issued_on, i.due_on,
                       i.subtotal, i.tax_total, i.total, i.customer_id,
                       coalesce(payments.paid_total, 0) AS paid_total,
                       greatest(i.total - coalesce(payments.paid_total, 0), 0) AS balance_due,
                       c.owner_code, c.display_name AS owner_name, c.email AS owner_email, c.billing_email AS owner_billing_email,
                       wo.id AS work_order_id, wo.work_order_number, wo.title AS work_order_title,
                       p.property_code, p.name AS property_name,
                       trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address,
                       i.created_at
                FROM invoices i
                LEFT JOIN (
                    SELECT tenant_id, invoice_id, sum(amount) AS paid_total
                    FROM payments
                    WHERE status = 'RECEIVED'
                    GROUP BY tenant_id, invoice_id
                ) payments ON payments.tenant_id = i.tenant_id AND payments.invoice_id = i.id
                JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
                LEFT JOIN work_orders wo ON wo.id = i.work_order_id AND wo.tenant_id = i.tenant_id
                LEFT JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                WHERE i.tenant_id = ?
                  AND (?::uuid IS NULL OR i.id = ?)
                ORDER BY i.created_at DESC
                """;
        var invoices = new LinkedHashMap<UUID, InvoiceDto>();
        jdbcTemplate.query(sql, rs -> {
            var invoice = mapInvoice(rs, List.of(), List.of());
            invoices.put(invoice.id(), invoice);
        }, tenantId, invoiceId, invoiceId);
        return invoices;
    }

    private LinkedHashMap<UUID, InvoiceDto> invoiceHeadersForOwner(UUID tenantId, UUID ownerId) {
        var invoices = new LinkedHashMap<UUID, InvoiceDto>();
        jdbcTemplate.query("""
                SELECT i.id, i.invoice_number, i.status::text AS status, i.issued_on, i.due_on,
                       i.subtotal, i.tax_total, i.total, i.customer_id,
                       coalesce(payments.paid_total, 0) AS paid_total,
                       greatest(i.total - coalesce(payments.paid_total, 0), 0) AS balance_due,
                       c.owner_code, c.display_name AS owner_name, c.email AS owner_email, c.billing_email AS owner_billing_email,
                       wo.id AS work_order_id, wo.work_order_number, wo.title AS work_order_title,
                       p.property_code, p.name AS property_name,
                       trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address,
                       i.created_at
                FROM invoices i
                LEFT JOIN (
                    SELECT tenant_id, invoice_id, sum(amount) AS paid_total
                    FROM payments
                    WHERE status = 'RECEIVED'
                    GROUP BY tenant_id, invoice_id
                ) payments ON payments.tenant_id = i.tenant_id AND payments.invoice_id = i.id
                JOIN customers c ON c.id = i.customer_id AND c.tenant_id = i.tenant_id
                LEFT JOIN work_orders wo ON wo.id = i.work_order_id AND wo.tenant_id = i.tenant_id
                LEFT JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                WHERE i.tenant_id = ? AND i.customer_id = ?
                ORDER BY i.created_at DESC
                """, rs -> {
            var invoice = mapInvoice(rs, List.of(), List.of());
            invoices.put(invoice.id(), invoice);
        }, tenantId, ownerId);
        return invoices;
    }

    private void attachLines(UUID tenantId, LinkedHashMap<UUID, InvoiceDto> invoices) {
        if (invoices.isEmpty()) {
            return;
        }
        for (var invoiceId : invoices.keySet()) {
            var lines = jdbcTemplate.query("""
                    SELECT id, line_type, description, quantity, unit_price, line_total, taxable, tax_rate
                    FROM invoice_lines
                    WHERE tenant_id = ? AND invoice_id = ?
                    ORDER BY created_at, description
                    """, (rs, rowNum) -> new InvoiceDto.InvoiceLineDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("line_type"),
                    rs.getString("description"),
                    rs.getBigDecimal("quantity"),
                    rs.getBigDecimal("unit_price"),
                    rs.getBigDecimal("line_total"),
                    rs.getBoolean("taxable"),
                    rs.getBigDecimal("tax_rate")
            ), tenantId, invoiceId);
            var payments = jdbcTemplate.query("""
                    SELECT id, status::text AS status, payment_method, amount, paid_at, reference, note, created_at
                    FROM payments
                    WHERE tenant_id = ? AND invoice_id = ?
                    ORDER BY coalesce(paid_at, created_at) DESC
                    """, (rs, rowNum) -> new InvoiceDto.PaymentDto(
                    rs.getObject("id", UUID.class),
                    rs.getString("status"),
                    rs.getString("payment_method"),
                    rs.getBigDecimal("amount"),
                    instant("paid_at", rs),
                    rs.getString("reference"),
                    rs.getString("note"),
                    instant("created_at", rs)
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
                    invoice.paidTotal(),
                    invoice.balanceDue(),
                    invoice.customerId(),
                    invoice.ownerCode(),
                    invoice.ownerName(),
                    invoice.ownerEmail(),
                    invoice.ownerBillingEmail(),
                    invoice.workOrderId(),
                    invoice.workOrderNumber(),
                    invoice.workOrderTitle(),
                    invoice.propertyCode(),
                    invoice.propertyName(),
                    invoice.propertyAddress(),
                    invoice.createdAt(),
                    invoice.workOrders(),
                    lines,
                    payments
            ));
        }
    }

    private void attachWorkOrders(UUID tenantId, LinkedHashMap<UUID, InvoiceDto> invoices) {
        if (invoices.isEmpty()) {
            return;
        }
        for (var invoiceId : invoices.keySet()) {
            var linked = jdbcTemplate.query("""
                    SELECT wo.id AS work_order_id, wo.work_order_number, wo.title, wo.status::text AS status,
                           coalesce(st.name, wo.title) AS service_name,
                           p.property_code, p.name AS property_name,
                           trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address
                    FROM invoice_work_orders iwo
                    JOIN work_orders wo ON wo.id = iwo.work_order_id AND wo.tenant_id = iwo.tenant_id
                    LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                    LEFT JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                    WHERE iwo.tenant_id = ? AND iwo.invoice_id = ?
                    ORDER BY wo.scheduled_start NULLS LAST, wo.work_order_number
                    """, (rs, rowNum) -> new InvoiceDto.InvoiceWorkOrderDto(
                    rs.getObject("work_order_id", UUID.class),
                    rs.getString("work_order_number"),
                    rs.getString("title"),
                    rs.getString("property_code"),
                    rs.getString("property_name"),
                    rs.getString("property_address"),
                    rs.getString("status"),
                    rs.getString("service_name")
            ), tenantId, invoiceId);
            var invoice = invoices.get(invoiceId);
            if (linked.isEmpty() && invoice.workOrderId() != null) {
                linked = List.of(new InvoiceDto.InvoiceWorkOrderDto(
                        invoice.workOrderId(),
                        invoice.workOrderNumber(),
                        invoice.workOrderTitle(),
                        invoice.propertyCode(),
                        invoice.propertyName(),
                        invoice.propertyAddress(),
                        "",
                        invoice.workOrderTitle()
                ));
            }
            invoices.put(invoiceId, new InvoiceDto(
                    invoice.id(),
                    invoice.invoiceNumber(),
                    invoice.status(),
                    invoice.issuedOn(),
                    invoice.dueOn(),
                    invoice.subtotal(),
                    invoice.taxTotal(),
                    invoice.total(),
                    invoice.paidTotal(),
                    invoice.balanceDue(),
                    invoice.customerId(),
                    invoice.ownerCode(),
                    invoice.ownerName(),
                    invoice.ownerEmail(),
                    invoice.ownerBillingEmail(),
                    invoice.workOrderId(),
                    invoice.workOrderNumber(),
                    invoice.workOrderTitle(),
                    invoice.propertyCode(),
                    invoice.propertyName(),
                    invoice.propertyAddress(),
                    invoice.createdAt(),
                    linked,
                    invoice.lines(),
                    invoice.payments()
            ));
        }
    }

    private InvoiceDto mapInvoice(ResultSet rs, List<InvoiceDto.InvoiceLineDto> lines, List<InvoiceDto.PaymentDto> payments) throws SQLException {
        return new InvoiceDto(
                rs.getObject("id", UUID.class),
                rs.getString("invoice_number"),
                rs.getString("status"),
                localDate("issued_on", rs),
                localDate("due_on", rs),
                rs.getBigDecimal("subtotal"),
                rs.getBigDecimal("tax_total"),
                rs.getBigDecimal("total"),
                rs.getBigDecimal("paid_total"),
                rs.getBigDecimal("balance_due"),
                rs.getObject("customer_id", UUID.class),
                rs.getString("owner_code"),
                rs.getString("owner_name"),
                rs.getString("owner_email"),
                rs.getString("owner_billing_email"),
                rs.getObject("work_order_id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("work_order_title"),
                rs.getString("property_code"),
                rs.getString("property_name"),
                rs.getString("property_address"),
                instant("created_at", rs),
                List.of(),
                lines,
                payments
        );
    }

    private InvoiceLineSnapshot lineSnapshot(UUID tenantId, UUID invoiceId, UUID lineId) {
        var line = jdbcTemplate.query("""
                SELECT id, line_type, description, quantity, unit_price, line_total, taxable, tax_rate
                FROM invoice_lines
                WHERE tenant_id = ? AND invoice_id = ? AND id = ?
                """, rs -> {
            if (!rs.next()) {
                return null;
            }
            return new InvoiceLineSnapshot(
                    rs.getObject("id", UUID.class),
                    rs.getString("line_type"),
                    rs.getString("description"),
                    money(rs.getBigDecimal("quantity")),
                    money(rs.getBigDecimal("unit_price")),
                    money(rs.getBigDecimal("line_total")),
                    rs.getBoolean("taxable"),
                    rate(rs.getBigDecimal("tax_rate"))
            );
        }, tenantId, invoiceId, lineId);
        if (line == null) {
            throw new ResourceNotFoundException("Invoice line not found.");
        }
        return line;
    }

    private List<String> changedLineFields(
            InvoiceLineSnapshot before,
            String lineType,
            String description,
            BigDecimal quantity,
            BigDecimal unitPrice,
            boolean taxable,
            BigDecimal taxRate
    ) {
        var fields = new ArrayList<String>();
        if (!before.lineType().equals(lineType)) {
            fields.add("lineType");
        }
        if (!before.description().equals(description)) {
            fields.add("description");
        }
        if (before.quantity().compareTo(quantity) != 0) {
            fields.add("quantity");
        }
        if (before.unitPrice().compareTo(unitPrice) != 0) {
            fields.add("unitPrice");
        }
        if (before.taxable() != taxable) {
            fields.add("taxable");
        }
        if (before.taxRate().compareTo(taxRate) != 0) {
            fields.add("taxRate");
        }
        return fields;
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
        var totals = jdbcTemplate.query("""
                SELECT coalesce(sum(line_total), 0) AS subtotal,
                       coalesce(sum(CASE WHEN taxable THEN greatest(line_total, 0) * tax_rate ELSE 0 END), 0) AS tax_total
                FROM invoice_lines
                WHERE tenant_id = ? AND invoice_id = ?
                """, rs -> {
            if (!rs.next()) {
                return new MoneyTotals(BigDecimal.ZERO, BigDecimal.ZERO);
            }
            return new MoneyTotals(money(rs.getBigDecimal("subtotal")), money(rs.getBigDecimal("tax_total")));
        }, tenantId, invoiceId);
        var subtotal = totals.subtotal();
        var taxTotal = totals.taxTotal();
        var total = subtotal.add(taxTotal).setScale(2, RoundingMode.HALF_UP);
        jdbcTemplate.update("""
                UPDATE invoices
                SET subtotal = ?, tax_total = ?, total = ?, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, subtotal, taxTotal, total, actorUserId, tenantId, invoiceId);
        updateInvoiceStatusFromPayments(tenantId, actorUserId, invoiceId);
    }

    private String description(InvoiceLineRequest request) {
        var description = request == null || request.description() == null ? "" : request.description().trim();
        if (description.isBlank()) {
            throw new BadRequestException("Line description is required.");
        }
        return description;
    }

    private String lineType(InvoiceLineRequest request) {
        var value = request == null || request.lineType() == null ? "CUSTOM" : request.lineType().trim().toUpperCase().replace('-', '_').replace(' ', '_');
        if (!Set.of("LABOR", "MATERIAL", "CUSTOM", "DISCOUNT").contains(value)) {
            throw new BadRequestException("Invoice line type must be labor, material, custom, or discount.");
        }
        return value;
    }

    private BigDecimal rate(BigDecimal value) {
        var rate = (value == null ? BigDecimal.ZERO : value).setScale(4, RoundingMode.HALF_UP);
        if (rate.signum() < 0 || rate.compareTo(BigDecimal.ONE) > 0) {
            throw new BadRequestException("Tax rate must be between 0 and 1.");
        }
        return rate;
    }

    private String normalizeStatus(String value) {
        var status = value == null ? "" : value.trim().toUpperCase().replace('-', '_').replace(' ', '_');
        if (!Set.of("DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID").contains(status)) {
            throw new BadRequestException("Invoice status is not supported.");
        }
        return status;
    }

    private String paymentMethod(String value) {
        var method = value == null ? "OTHER" : value.trim().toUpperCase().replace('-', '_').replace(' ', '_');
        if (!Set.of("CASH", "CHEQUE", "E_TRANSFER", "CARD", "BANK_TRANSFER", "OTHER").contains(method)) {
            throw new BadRequestException("Payment method is not supported.");
        }
        return method;
    }

    private String text(String value) {
        return value == null ? null : value.trim();
    }

    private void updateInvoiceStatusFromPayments(UUID tenantId, UUID actorUserId, UUID invoiceId) {
        var invoice = get(tenantId, invoiceId);
        if ("VOID".equals(invoice.status())) {
            return;
        }
        var nextStatus = invoice.balanceDue().signum() <= 0 ? "PAID" : invoice.paidTotal().signum() > 0 ? "PARTIALLY_PAID" : invoice.status();
        jdbcTemplate.update("""
                UPDATE invoices
                SET status = ?::invoice_status, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND status <> ?::invoice_status
                """, nextStatus, actorUserId, tenantId, invoiceId, nextStatus);
        syncWorkOrdersFromInvoice(tenantId, actorUserId, invoice.id(), nextStatus);
    }

    private void syncWorkOrdersFromInvoice(UUID tenantId, UUID actorUserId, UUID invoiceId, String invoiceStatus) {
        var workOrderIds = invoiceWorkOrderIds(tenantId, invoiceId);
        if (workOrderIds.isEmpty()) {
            return;
        }
        var sqlArgs = args(actorUserId, tenantId, workOrderIds);
        if ("PAID".equals(invoiceStatus)) {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'PAID'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id IN (%s) AND status <> 'PAID'
                    """.formatted(placeholders(workOrderIds)), sqlArgs);
        } else if (Set.of("SENT", "PARTIALLY_PAID", "OVERDUE").contains(invoiceStatus)) {
            jdbcTemplate.update("""
                    UPDATE work_orders
                    SET status = 'INVOICED'::work_order_status, updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id IN (%s) AND status NOT IN ('PAID'::work_order_status, 'CANCELLED'::work_order_status)
                    """.formatted(placeholders(workOrderIds)), sqlArgs);
        }
    }

    private UUID insertLine(
            UUID tenantId,
            UUID actorUserId,
            UUID invoiceId,
            String lineType,
            String description,
            BigDecimal quantity,
            BigDecimal unitPrice,
            boolean taxable,
            BigDecimal taxRate
    ) {
        var lineId = UUID.randomUUID();
        var lineTotal = quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP);
        jdbcTemplate.update("""
                INSERT INTO invoice_lines (
                    id, tenant_id, invoice_id, line_type, description, quantity, unit_price, line_total, taxable, tax_rate, created_by, updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, lineId, tenantId, invoiceId, lineType, description, quantity, unitPrice, lineTotal, taxable, taxRate, actorUserId, actorUserId);
        return lineId;
    }

    private List<InvoiceWorkOrderDraft> invoiceWorkOrders(UUID tenantId, UUID ownerId, UUID propertyId, List<UUID> workOrderIds) {
        var sql = """
                SELECT wo.id, wo.work_order_number, wo.title, wo.status::text AS status, wo.property_id,
                       wo.customer_id AS owner_id, wo.service_type_id, coalesce(st.name, wo.title) AS service_name,
                       coalesce(st.base_price, 0) AS base_price,
                       p.name AS property_name,
                       trim(concat_ws(', ', p.address_line1, nullif(p.city, ''), nullif(p.province_code, ''), nullif(p.postal_code, ''))) AS property_address
                FROM work_orders wo
                LEFT JOIN service_types st ON st.id = wo.service_type_id AND st.tenant_id = wo.tenant_id
                LEFT JOIN properties p ON p.id = wo.property_id AND p.tenant_id = wo.tenant_id
                WHERE wo.tenant_id = ?
                  AND wo.customer_id = ?
                  AND (?::uuid IS NULL OR wo.property_id = ?)
                  AND wo.id IN (%s)
                ORDER BY wo.scheduled_start NULLS LAST, wo.work_order_number
                """.formatted(placeholders(workOrderIds));
        return jdbcTemplate.query(sql, (rs, rowNum) -> new InvoiceWorkOrderDraft(
                rs.getObject("id", UUID.class),
                rs.getString("work_order_number"),
                rs.getString("title"),
                rs.getString("status"),
                rs.getObject("property_id", UUID.class),
                rs.getObject("owner_id", UUID.class),
                rs.getObject("service_type_id", UUID.class),
                rs.getString("service_name"),
                money(rs.getBigDecimal("base_price")),
                rs.getString("property_name"),
                rs.getString("property_address")
        ), args(tenantId, ownerId, propertyId, propertyId, workOrderIds));
    }

    private List<InvoiceLineDraft> invoiceLines(UUID tenantId, InvoiceWorkOrderDraft workOrder) {
        var lines = new ArrayList<InvoiceLineDraft>();
        if (workOrder.basePrice().signum() > 0) {
            lines.add(new InvoiceLineDraft(
                    "%s - %s".formatted(workOrder.serviceName(), workOrder.workOrderNumber()),
                    BigDecimal.ONE.setScale(2, RoundingMode.HALF_UP),
                    workOrder.basePrice(),
                    "SERVICE"
            ));
        }
        lines.addAll(jdbcTemplate.query("""
                SELECT coalesce(ii.name, wom.description) AS description, wom.quantity, coalesce(wom.unit_cost, 0) AS unit_cost
                FROM work_order_materials wom
                LEFT JOIN inventory_items ii ON ii.id = wom.inventory_item_id AND ii.tenant_id = wom.tenant_id
                WHERE wom.tenant_id = ? AND wom.work_order_id = ? AND wom.used = true
                ORDER BY wom.created_at, wom.description
                """, (rs, rowNum) -> {
            var quantity = money(rs.getBigDecimal("quantity"));
            var unitPrice = money(rs.getBigDecimal("unit_cost"));
            return new InvoiceLineDraft(
                    "Material: %s - %s".formatted(rs.getString("description"), workOrder.workOrderNumber()),
                    quantity,
                    unitPrice,
                    "MATERIAL"
            );
        }, tenantId, workOrder.id()).stream().filter(line -> line.lineTotal().signum() > 0).toList());
        if (lines.isEmpty()) {
            lines.add(new InvoiceLineDraft(
                    "%s - %s".formatted(workOrder.title(), workOrder.workOrderNumber()),
                    BigDecimal.ONE.setScale(2, RoundingMode.HALF_UP),
                    BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP),
                    "SERVICE"
            ));
        }
        return lines;
    }

    private List<UUID> invoiceWorkOrderIds(UUID tenantId, UUID invoiceId) {
        return jdbcTemplate.queryForList("""
                SELECT work_order_id
                FROM invoice_work_orders
                WHERE tenant_id = ? AND invoice_id = ?
                UNION
                SELECT work_order_id
                FROM invoices
                WHERE tenant_id = ? AND id = ? AND work_order_id IS NOT NULL
                """, UUID.class, tenantId, invoiceId, tenantId, invoiceId);
    }

    private String invoiceNumber() {
        return "INV-%s-%s".formatted(
                LocalDate.now().toString().replace("-", ""),
                UUID.randomUUID().toString().substring(0, 6).toUpperCase()
        );
    }

    private String invoiceLineType(String sourceType) {
        return "MATERIAL".equals(sourceType) ? "MATERIAL" : "LABOR";
    }

    private String placeholders(List<?> values) {
        return String.join(", ", values.stream().map(ignored -> "?").toList());
    }

    private Object[] args(Object... values) {
        var args = new ArrayList<>();
        for (var value : values) {
            if (value instanceof List<?> list) {
                args.addAll(list);
            } else {
                args.add(value);
            }
        }
        return args.toArray();
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

    private record OwnerRef(UUID id, String name, String email, String billingEmail) {
    }

    private record MoneyTotals(BigDecimal subtotal, BigDecimal taxTotal) {
    }

    private record InvoiceLineSnapshot(
            UUID id,
            String lineType,
            String description,
            BigDecimal quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal,
            boolean taxable,
            BigDecimal taxRate
    ) {
    }

    private record InvoiceWorkOrderDraft(
            UUID id,
            String workOrderNumber,
            String title,
            String status,
            UUID propertyId,
            UUID ownerId,
            UUID serviceTypeId,
            String serviceName,
            BigDecimal basePrice,
            String propertyName,
            String propertyAddress
    ) {
    }

    private record InvoiceLineDraft(String description, BigDecimal quantity, BigDecimal unitPrice, BigDecimal lineTotal, String sourceType) {
        private InvoiceLineDraft(String description, BigDecimal quantity, BigDecimal unitPrice, String sourceType) {
            this(description, quantity, unitPrice, quantity.multiply(unitPrice).setScale(2, RoundingMode.HALF_UP), sourceType);
        }
    }
}
