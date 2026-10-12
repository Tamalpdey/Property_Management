package com.lorne.platform.quote.internal.service;

import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundEmailAttachment;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.EmailTemplateOperations;
import com.lorne.platform.notification.EmailLogoRenderer;
import com.lorne.platform.notification.QuoteEmailResendOperations;
import com.lorne.platform.quote.internal.dto.PublicQuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteDecisionRequest;
import com.lorne.platform.quote.internal.dto.QuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteLineDto;
import com.lorne.platform.quote.internal.dto.QuoteModuleStatus;
import com.lorne.platform.quote.internal.dto.QuoteSendResult;
import com.lorne.platform.quote.internal.dto.SendQuoteRequest;
import com.lorne.platform.quote.internal.dto.UpsertQuoteRequest;
import com.lorne.platform.quote.internal.dto.QuoteShareResult;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.shared.exception.ResourceNotFoundException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.workorder.QuoteWorkOrderOperations;
import com.lorne.platform.workorder.QuoteWorkOrderRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Date;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QuoteManagementService implements QuoteEmailResendOperations {
    public static final String MODULE_CODE = "QUOTES";
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final JdbcTemplate jdbcTemplate;
    private final AuditWriter auditWriter;
    private final TenantSettingsOperations tenantSettingsOperations;
    private final OutboundMailOperations outboundMailOperations;
    private final QuoteWorkOrderOperations quoteWorkOrderOperations;
    private final QuotePdfService quotePdfService;
    private final PasswordEncoder passwordEncoder;
    private final QuoteAccessService accessService;
    private final ObjectMapper objectMapper;
    private final LornePublicUrlProperties publicUrls;
    private final EmailTemplateOperations emailTemplates;
    private final EmailLogoRenderer emailLogoRenderer;

    public QuoteManagementService(
            JdbcTemplate jdbcTemplate,
            AuditWriter auditWriter,
            TenantSettingsOperations tenantSettingsOperations,
            OutboundMailOperations outboundMailOperations,
            QuoteWorkOrderOperations quoteWorkOrderOperations,
            QuotePdfService quotePdfService,
            PasswordEncoder passwordEncoder,
            QuoteAccessService accessService,
            ObjectMapper objectMapper,
            LornePublicUrlProperties publicUrls,
            EmailTemplateOperations emailTemplates,
            EmailLogoRenderer emailLogoRenderer
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditWriter = auditWriter;
        this.tenantSettingsOperations = tenantSettingsOperations;
        this.outboundMailOperations = outboundMailOperations;
        this.quoteWorkOrderOperations = quoteWorkOrderOperations;
        this.quotePdfService = quotePdfService;
        this.passwordEncoder = passwordEncoder;
        this.accessService = accessService;
        this.objectMapper = objectMapper;
        this.publicUrls = publicUrls;
        this.emailTemplates = emailTemplates;
        this.emailLogoRenderer = emailLogoRenderer;
    }

    @Transactional(readOnly = true)
    public QuoteModuleStatus moduleStatus(UUID tenantId) {
        return new QuoteModuleStatus(isEnabled(tenantId));
    }

    @Transactional(readOnly = true)
    public List<QuoteDto> list(UUID tenantId, String search, String status) {
        requireEnabled(tenantId);
        var searchValue = search == null || search.isBlank() ? null : "%" + search.trim().toLowerCase() + "%";
        var statusValue = status == null || status.isBlank() || "ALL".equalsIgnoreCase(status) ? null : status.trim().toUpperCase();
        return queryQuotes(tenantId, null, null, searchValue, statusValue);
    }

    @Transactional(readOnly = true)
    public QuoteDto get(UUID tenantId, UUID quoteId) {
        requireEnabled(tenantId);
        return requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
    }

    @Transactional
    public QuoteDto create(UUID tenantId, UUID actorUserId, UpsertQuoteRequest request) {
        requireEnabled(tenantId);
        validateReferences(tenantId, request);
        var issueDate = request.issueDate() == null ? LocalDate.now() : request.issueDate();
        validateDates(issueDate, request.validUntil());
        var totals = totals(request, tenantSettingsOperations.settings(tenantId).invoiceTaxRate());
        var quoteNumber = nextQuoteNumber(tenantId, issueDate);
        var quoteId = jdbcTemplate.queryForObject("""
                INSERT INTO quotes (
                    tenant_id, quote_number, customer_id, adhoc_customer_name, adhoc_customer_email,
                    adhoc_customer_phone, property_id, adhoc_property_name, adhoc_property_address,
                    service_type_id, title, scope,
                    issue_date, valid_until, subtotal, tax_rate, tax_amount, total, notes, terms,
                    created_by, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, UUID.class,
                tenantId, quoteNumber, request.customerId(), adhocValue(request.customerId(), request.adhocCustomerName()),
                adhocValue(request.customerId(), request.adhocCustomerEmail()), adhocValue(request.customerId(), request.adhocCustomerPhone()),
                request.propertyId(), adhocValue(request.propertyId(), request.adhocPropertyName()),
                adhocValue(request.propertyId(), request.adhocPropertyAddress()), request.serviceTypeId(),
                request.title().trim(), blankToNull(request.scope()), Date.valueOf(issueDate), sqlDate(request.validUntil()),
                totals.subtotal(), totals.taxRate(), totals.taxAmount(), totals.total(),
                blankToNull(request.notes()), blankToNull(request.terms()), actorUserId, actorUserId);
        replaceLines(tenantId, quoteId, actorUserId, request.lines());
        auditWriter.record(tenantId, actorUserId, "QUOTE_CREATED", "QUOTE", quoteId, Map.of(
                "quoteNumber", quoteNumber, "total", totals.total().toPlainString()));
        return requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
    }

    @Transactional
    public QuoteDto update(UUID tenantId, UUID actorUserId, UUID quoteId, UpsertQuoteRequest request) {
        requireEnabled(tenantId);
        lockQuote(tenantId, quoteId);
        var current = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        if (!List.of("DRAFT", "DECLINED").contains(current.status())) {
            throw new BadRequestException("Only draft or declined quotes can be edited.");
        }
        validateReferences(tenantId, request);
        var issueDate = request.issueDate() == null ? current.issueDate() : request.issueDate();
        validateDates(issueDate, request.validUntil());
        var totals = totals(request, tenantSettingsOperations.settings(tenantId).invoiceTaxRate());
        var updated = jdbcTemplate.update("""
                UPDATE quotes
                SET customer_id = ?, adhoc_customer_name = ?, adhoc_customer_email = ?, adhoc_customer_phone = ?,
                    property_id = ?, adhoc_property_name = ?, adhoc_property_address = ?,
                    service_type_id = ?, title = ?, scope = ?,
                    issue_date = ?, valid_until = ?, subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?,
                    notes = ?, terms = ?, status = 'DRAFT', approval_token_hash = NULL,
                    access_password_hash = NULL, published_details = NULL,
                    approval_name = NULL, approval_comment = NULL, approved_at = NULL, declined_at = NULL,
                    updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND status IN ('DRAFT', 'DECLINED')
                """,
                request.customerId(), adhocValue(request.customerId(), request.adhocCustomerName()),
                adhocValue(request.customerId(), request.adhocCustomerEmail()), adhocValue(request.customerId(), request.adhocCustomerPhone()),
                request.propertyId(), adhocValue(request.propertyId(), request.adhocPropertyName()),
                adhocValue(request.propertyId(), request.adhocPropertyAddress()), request.serviceTypeId(), request.title().trim(),
                blankToNull(request.scope()), Date.valueOf(issueDate), sqlDate(request.validUntil()),
                totals.subtotal(), totals.taxRate(), totals.taxAmount(), totals.total(),
                blankToNull(request.notes()), blankToNull(request.terms()), actorUserId, tenantId, quoteId);
        if (updated == 0) {
            throw new BadRequestException("This quote was already sent or responded to and can no longer be changed.");
        }
        replaceLines(tenantId, quoteId, actorUserId, request.lines());
        auditWriter.record(tenantId, actorUserId, "QUOTE_UPDATED", "QUOTE", quoteId, Map.of(
                "quoteNumber", current.quoteNumber(), "total", totals.total().toPlainString()));
        return requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
    }

    @Transactional
    public QuoteSendResult send(UUID tenantId, UUID actorUserId, UUID quoteId, SendQuoteRequest request) {
        requireEnabled(tenantId);
        lockQuote(tenantId, quoteId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        if (!List.of("DRAFT", "DECLINED", "SENT", "VIEWED").contains(quote.status())) {
            throw new BadRequestException("This quote can no longer be sent.");
        }
        var recipient = firstNonBlank(request.recipientEmail(), quote.customerEmail());
        if (recipient == null) {
            throw new BadRequestException("The client email is required before sending this quote.");
        }
        var responseUrl = publish(tenantId, actorUserId, quote, request.accessPassword());
        var published = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        var settings = tenantSettingsOperations.settings(tenantId);
        var template = emailTemplates.ensureDefaultQuoteTemplate(tenantId, actorUserId);
        if (!template.active()) throw new BadRequestException("The quote email template is inactive.");
        var message = firstNonBlank(request.message(), "Please review the quote below and approve or decline it online.");
        var logo = emailLogoRenderer.render(settings.logoUrl(), settings.invoiceBrandName(), settings.themePrimaryColor());
        var values = new LinkedHashMap<String, String>();
        values.put("tenantName", settings.invoiceBrandName());
        values.put("tenantPrimaryColor", settings.themePrimaryColor());
        values.put("tenantAccentColor", settings.themeAccentColor());
        values.put("tenantLogoUrl", logo.publicUrl());
        values.put("tenantPhone", settings.phone());
        values.put("tenantEmail", settings.effectiveSupportEmail(""));
        values.put("clientName", quote.customerName());
        values.put("ownerName", quote.customerName());
        values.put("clientEmail", quote.customerEmail());
        values.put("propertyName", quote.propertyName());
        values.put("propertyAddress", quote.propertyAddress());
        values.put("serviceName", quote.serviceName());
        values.put("quoteNumber", quote.quoteNumber());
        values.put("quoteTitle", quote.title());
        values.put("quoteScope", quote.scope());
        values.put("quoteNotes", quote.notes());
        values.put("quoteTerms", quote.terms());
        values.put("quoteSubtotal", money(quote.subtotal()));
        values.put("quoteTax", money(quote.taxAmount()));
        values.put("quoteTotal", money(quote.total()));
        values.put("issuedOn", quote.issueDate().toString());
        values.put("validUntil", quote.validUntil() == null ? "Open" : quote.validUntil().toString());
        values.put("quoteLink", responseUrl);
        values.put("message", message);
        var subject = emailTemplates.render(firstNonBlank(request.subject(), template.subject()), values);
        var bodyValues = new LinkedHashMap<String, String>();
        values.forEach((key, value) -> bodyValues.put(key, escape(value)));
        bodyValues.put("tenantLogoBlock", logo.htmlBlock());
        bodyValues.put("quoteLinkBlock", "<a href=\"" + escape(responseUrl) + "\" style=\"display:inline-block;padding:12px 18px;background:"
                + escape(settings.themePrimaryColor()) + ";color:#ffffff;text-decoration:none;font-weight:bold;\">Review quote</a>");
        boolean html = template.body().matches("(?s).*<[^>]+>.*");
        var body = emailTemplates.render(template.body(), html ? bodyValues : values);
        if (!body.contains(responseUrl)) {
            body += html ? "<p>Review quote: <a href=\"" + escape(responseUrl) + "\">" + escape(responseUrl) + "</a></p>"
                    : "\n\nReview quote: " + responseUrl;
        }
        var attachment = new OutboundEmailAttachment(quote.quoteNumber().replaceAll("[^A-Za-z0-9._-]", "_") + ".pdf",
                quotePdfService.generate(published, tenantId, settings), "application/pdf");
        var delivery = outboundMailOperations.send(tenantId, new OutboundEmailMessage(recipient, subject, body,
                List.of(attachment), List.of(), List.of(), logo.inlineImages()));

        var deliveryLogId = jdbcTemplate.queryForObject("""
                INSERT INTO email_delivery_logs (
                    tenant_id, quote_id, template_id, customer_id, recipient_email, subject, body, status,
                    provider_message, sent_at, delivery_mode, created_by, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?)
                RETURNING id
                """, UUID.class, tenantId, quoteId, template.id(), quote.customerId(), recipient, subject, body, delivery.status(),
                delivery.providerMessage(), delivery.sentAt() == null ? null : Timestamp.from(delivery.sentAt()),
                actorUserId, actorUserId);
        if ("SENT".equals(delivery.status())) {
            jdbcTemplate.update("""
                    UPDATE quotes
                    SET sent_at = now(),
                        updated_by = ?, updated_at = now()
                    WHERE tenant_id = ? AND id = ?
                    """, actorUserId, tenantId, quoteId);
        }
        var action = "SENT".equals(delivery.status()) ? "QUOTE_EMAIL_SENT"
                : "FAILED".equals(delivery.status()) ? "QUOTE_EMAIL_FAILED" : "QUOTE_EMAIL_RECORDED";
        auditWriter.record(tenantId, actorUserId, action, "QUOTE", quoteId, Map.of(
                "quoteNumber", quote.quoteNumber(), "recipientEmail", recipient, "status", delivery.status(),
                "deliveryLogId", deliveryLogId.toString(), "subject", subject, "templateId", template.id().toString(),
                "provider", firstNonBlank(delivery.provider(), "Unknown"),
                "providerMessage", delivery.providerMessage() == null ? "" : delivery.providerMessage()));
        return new QuoteSendResult(delivery.status(), recipient, delivery.sentAt(), responseUrl);
    }

    @Transactional
    public QuoteShareResult share(UUID tenantId, UUID actorUserId, UUID quoteId, String password) {
        requireEnabled(tenantId);
        lockQuote(tenantId, quoteId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        if (!List.of("DRAFT", "DECLINED", "SENT", "VIEWED").contains(quote.status())) {
            throw new BadRequestException("This quote is locked and cannot be shared again.");
        }
        return new QuoteShareResult(publish(tenantId, actorUserId, quote, password));
    }

    private String publish(UUID tenantId, UUID actorUserId, QuoteDto quote, String password) {
        if (password == null || password.length() < 8 || password.length() > 64
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BadRequestException("Use a password of 8 to 64 characters (up to 72 UTF-8 bytes).");
        }
        validateDates(LocalDate.now(), quote.validUntil());
        var token = newToken();
        String details;
        try {
            details = objectMapper.writeValueAsString(quote);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("Quote could not be prepared for sharing.", exception);
        }
        jdbcTemplate.update("""
                UPDATE quotes SET status = 'SENT', approval_token_hash = ?, access_password_hash = ?,
                    published_details = ?::jsonb, access_failed_attempts = 0, access_locked_until = NULL,
                    viewed_at = NULL, approval_name = NULL, approval_comment = NULL,
                    approved_at = NULL, declined_at = NULL, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, hash(token), passwordEncoder.encode(password), details, actorUserId, tenantId, quote.id());
        auditWriter.record(tenantId, actorUserId, "QUOTE_SHARED", "QUOTE", quote.id(), Map.of("quoteNumber", quote.quoteNumber()));
        return publicResponseUrl(tenantId, token);
    }

    @Transactional
    public QuoteDto voidQuote(UUID tenantId, UUID actorUserId, UUID quoteId) {
        requireEnabled(tenantId);
        lockQuote(tenantId, quoteId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        if (List.of("APPROVED", "CONVERTED").contains(quote.status())) {
            throw new BadRequestException("An approved quote is locked and cannot be voided.");
        }
        jdbcTemplate.update("""
                UPDATE quotes SET status = 'VOID', approval_token_hash = NULL, updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ?
                """, actorUserId, tenantId, quoteId);
        auditWriter.record(tenantId, actorUserId, "QUOTE_VOIDED", "QUOTE", quoteId, Map.of("quoteNumber", quote.quoteNumber()));
        return requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
    }

    @Transactional
    public QuoteDto convert(UUID tenantId, UUID actorUserId, UUID quoteId, UUID destinationPropertyId) {
        requireEnabled(tenantId);
        jdbcTemplate.queryForObject("SELECT id FROM quotes WHERE tenant_id = ? AND id = ? FOR UPDATE", UUID.class, tenantId, quoteId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        if (quote.convertedWorkOrderId() != null) {
            return quote;
        }
        if (!"APPROVED".equals(quote.status())) {
            throw new BadRequestException("Only an approved quote can be converted to a work order.");
        }
        var propertyId = quote.propertyId() == null ? destinationPropertyId : quote.propertyId();
        if (propertyId == null) {
            throw new BadRequestException("Select a saved property for the new work order.");
        }
        var propertyCount = jdbcTemplate.queryForObject("""
                SELECT count(*)::int FROM properties WHERE tenant_id = ? AND id = ?
                    AND (?::uuid IS NULL OR customer_id = ?)
                """, Integer.class, tenantId, propertyId, quote.customerId(), quote.customerId());
        if (propertyCount == null || propertyCount == 0) {
            throw new BadRequestException("Select a property belonging to this tenant and quote client.");
        }
        var result = quoteWorkOrderOperations.createFromQuote(tenantId, actorUserId, new QuoteWorkOrderRequest(
                propertyId, quote.serviceTypeId(), quote.title(), workOrderDescription(quote),
                quote.customerName(), quote.customerEmail(), quote.customerPhone()));
        jdbcTemplate.update("""
                UPDATE quotes
                SET status = 'CONVERTED', converted_work_order_id = ?, converted_at = now(),
                    updated_by = ?, updated_at = now()
                WHERE tenant_id = ? AND id = ? AND converted_work_order_id IS NULL
                """, result.id(), actorUserId, tenantId, quoteId);
        auditWriter.record(tenantId, actorUserId, "QUOTE_CONVERTED", "QUOTE", quoteId, Map.of(
                "quoteNumber", quote.quoteNumber(), "workOrderId", result.id().toString(),
                "workOrderNumber", result.workOrderNumber()));
        return requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
    }

    @Transactional
    public PublicQuoteDto publicQuote(String token, String password) {
        requirePublicPassword(token, password);
        lockPublicQuote(token);
        var quote = requiredQuote(queryQuotes(null, null, hash(token), null, null));
        expireIfNeeded(quote);
        if ("SENT".equals(quote.status())) {
            jdbcTemplate.update("UPDATE quotes SET status = 'VIEWED', viewed_at = coalesce(viewed_at, now()), updated_at = now() WHERE id = ?", quote.id());
            quote = requiredQuote(queryQuotes(null, quote.id(), null, null, null));
        }
        auditWriter.record(tenantIdForQuote(quote.id()), null, "QUOTE_VIEWED", "QUOTE", quote.id(),
                Map.of("quoteNumber", quote.quoteNumber(), "status", quote.status(), "source", "CLIENT_LINK"));
        return publicView(quote);
    }

    @Transactional
    public PublicQuoteDto decide(String token, String password, boolean approve, QuoteDecisionRequest request) {
        requirePublicPassword(token, password);
        lockPublicQuote(token);
        var quote = requiredQuote(queryQuotes(null, null, hash(token), null, null));
        expireIfNeeded(quote);
        if (List.of("APPROVED", "DECLINED", "CONVERTED").contains(quote.status())) {
            return publicView(quote);
        }
        if (!List.of("SENT", "VIEWED").contains(quote.status())) {
            throw new BadRequestException("This quote is no longer awaiting a response.");
        }
        var status = approve ? "APPROVED" : "DECLINED";
        jdbcTemplate.update("""
                UPDATE quotes
                SET status = ?, approval_name = ?, approval_comment = ?,
                    approved_at = CASE WHEN ? THEN now() ELSE NULL END,
                    declined_at = CASE WHEN ? THEN now() ELSE NULL END,
                    updated_at = now()
                WHERE id = ?
                """, status, request.name().trim(), blankToNull(request.comment()), approve, !approve, quote.id());
        var tenantId = tenantIdForQuote(quote.id());
        auditWriter.record(tenantId, null, approve ? "QUOTE_APPROVED" : "QUOTE_DECLINED", "QUOTE", quote.id(), Map.of(
                "quoteNumber", quote.quoteNumber(), "clientName", request.name().trim(),
                "clientNotes", request.comment() == null ? "" : request.comment().trim(), "source", "CLIENT_LINK"));
        return publicView(requiredQuote(queryQuotes(null, quote.id(), null, null, null)));
    }

    private PublicQuoteDto publicView(QuoteDto quote) {
        var settings = tenantSettingsOperations.settings(tenantIdForQuote(quote.id()));
        return new PublicQuoteDto(settings.invoiceBrandName(), settings.logoUrl(), settings.themePrimaryColor(),
                settings.effectiveSupportEmail(""), settings.phone(), quote);
    }

    private void requirePublicPassword(String token, String password) {
        accessService.verify(hash(token), password);
    }

    private void lockQuote(UUID tenantId, UUID quoteId) {
        var ids = jdbcTemplate.queryForList("SELECT id FROM quotes WHERE tenant_id = ? AND id = ? FOR UPDATE", UUID.class, tenantId, quoteId);
        if (ids.isEmpty()) throw new ResourceNotFoundException("Quote not found.");
    }

    private void lockPublicQuote(String token) {
        var ids = jdbcTemplate.queryForList("SELECT id FROM quotes WHERE approval_token_hash = ? FOR UPDATE", UUID.class, hash(token));
        if (ids.isEmpty()) throw new ResourceNotFoundException("Quote not found.");
    }

    @Transactional
    public byte[] pdf(UUID tenantId, UUID actorUserId, UUID quoteId) {
        requireEnabled(tenantId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        auditWriter.record(tenantId, actorUserId, "QUOTE_PDF_DOWNLOADED", "QUOTE", quoteId,
                Map.of("quoteNumber", quote.quoteNumber()));
        return quotePdfService.generate(quote, tenantId, tenantSettingsOperations.settings(tenantId));
    }

    @Override
    @Transactional(readOnly = true)
    public OutboundEmailAttachment quoteAttachment(UUID tenantId, UUID quoteId, String emailBody) {
        requireEnabled(tenantId);
        var quote = requiredQuote(queryQuotes(tenantId, quoteId, null, null, null));
        var matcher = java.util.regex.Pattern.compile("/quote-response/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])").matcher(emailBody == null ? "" : emailBody);
        boolean activeLink = false;
        while (matcher.find()) {
            var count = jdbcTemplate.queryForObject("SELECT count(*) FROM quotes WHERE tenant_id = ? AND id = ? AND approval_token_hash = ? AND status NOT IN ('VOID', 'EXPIRED')", Integer.class,
                    tenantId, quoteId, hash(matcher.group(1)));
            if (count != null && count > 0) { activeLink = true; break; }
        }
        if (!activeLink) throw new BadRequestException("This email contains an old or inactive quote link. Send a new quote email from Quotes.");
        return new OutboundEmailAttachment(quote.quoteNumber().replaceAll("[^A-Za-z0-9._-]", "_") + ".pdf",
                quotePdfService.generate(quote, tenantId, tenantSettingsOperations.settings(tenantId)), "application/pdf");
    }

    @Transactional
    public byte[] publicPdf(String token, String password) {
        requirePublicPassword(token, password);
        var quote = requiredQuote(queryQuotes(null, null, hash(token), null, null));
        var tenantId = tenantIdForQuote(quote.id());
        auditWriter.record(tenantId, null, "QUOTE_CLIENT_PDF_DOWNLOADED", "QUOTE", quote.id(),
                Map.of("quoteNumber", quote.quoteNumber(), "source", "CLIENT_LINK"));
        return quotePdfService.generate(quote, tenantId, tenantSettingsOperations.settings(tenantId));
    }

    private List<QuoteDto> queryQuotes(UUID tenantId, UUID quoteId, String tokenHash, String search, String status) {
        return jdbcTemplate.query("""
                SELECT q.*,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'customerName' ELSE coalesce(c.display_name, q.adhoc_customer_name) END AS customer_name,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'customerEmail' ELSE coalesce(c.email::text, q.adhoc_customer_email::text) END AS customer_email,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'customerPhone' ELSE coalesce(c.phone, q.adhoc_customer_phone) END AS customer_phone,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'propertyName' ELSE coalesce(p.name, q.adhoc_property_name) END AS property_name,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'propertyAddress' ELSE coalesce(nullif(concat_ws(', ', p.address_line1, nullif(p.address_line2, ''), p.city, p.province_code, p.postal_code), ''), q.adhoc_property_address) END AS property_address,
                       CASE WHEN q.published_details IS NOT NULL THEN q.published_details->>'serviceName' ELSE st.name END AS service_name,
                       wo.work_order_number AS converted_work_order_number
                FROM quotes q
                LEFT JOIN customers c ON c.id = q.customer_id AND c.tenant_id = q.tenant_id
                LEFT JOIN properties p ON p.id = q.property_id AND p.tenant_id = q.tenant_id
                LEFT JOIN service_types st ON st.id = q.service_type_id AND st.tenant_id = q.tenant_id
                LEFT JOIN work_orders wo ON wo.id = q.converted_work_order_id AND wo.tenant_id = q.tenant_id
                WHERE (?::uuid IS NULL OR q.tenant_id = ?)
                  AND (?::uuid IS NULL OR q.id = ?)
                  AND (?::text IS NULL OR q.approval_token_hash = ?)
                  AND (?::text IS NULL OR lower(q.quote_number || ' ' || q.title || ' ' || coalesce(c.display_name, q.adhoc_customer_name, '') || ' ' || coalesce(p.name, q.adhoc_property_name, '')) LIKE ?)
                  AND (?::text IS NULL OR q.status = ?)
                ORDER BY q.created_at DESC
                """, (rs, rowNum) -> mapQuote(rs),
                tenantId, tenantId, quoteId, quoteId, tokenHash, tokenHash, search, search, status, status);
    }

    private QuoteDto mapQuote(ResultSet rs) throws SQLException {
        var quoteId = rs.getObject("id", UUID.class);
        var tenantId = rs.getObject("tenant_id", UUID.class);
        var lines = jdbcTemplate.query("""
                SELECT id, description, quantity, unit, rate, amount, sort_order
                FROM quote_lines WHERE tenant_id = ? AND quote_id = ? ORDER BY sort_order, created_at
                """, (lineRs, rowNum) -> new QuoteLineDto(
                lineRs.getObject("id", UUID.class), lineRs.getString("description"),
                lineRs.getBigDecimal("quantity"), lineRs.getString("unit"), lineRs.getBigDecimal("rate"),
                lineRs.getBigDecimal("amount"), lineRs.getInt("sort_order")), tenantId, quoteId);
        return new QuoteDto(
                quoteId, rs.getString("quote_number"), rs.getObject("customer_id", UUID.class),
                rs.getString("customer_name"), rs.getString("customer_email"), rs.getString("customer_phone"),
                rs.getObject("property_id", UUID.class), rs.getString("property_name"), rs.getString("property_address"),
                rs.getObject("service_type_id", UUID.class), rs.getString("service_name"), rs.getString("title"),
                rs.getString("scope"), rs.getString("status"), rs.getObject("issue_date", LocalDate.class),
                rs.getObject("valid_until", LocalDate.class), rs.getBigDecimal("subtotal"), rs.getBigDecimal("tax_rate"),
                rs.getBigDecimal("tax_amount"), rs.getBigDecimal("total"), rs.getString("notes"), rs.getString("terms"),
                rs.getString("approval_name"), rs.getString("approval_comment"), instant(rs, "sent_at"),
                instant(rs, "viewed_at"), instant(rs, "approved_at"), instant(rs, "declined_at"),
                instant(rs, "converted_at"), rs.getObject("converted_work_order_id", UUID.class),
                rs.getString("converted_work_order_number"), instant(rs, "created_at"), instant(rs, "updated_at"), lines);
    }

    private void replaceLines(UUID tenantId, UUID quoteId, UUID actorUserId, List<UpsertQuoteRequest.Line> lines) {
        jdbcTemplate.update("DELETE FROM quote_lines WHERE tenant_id = ? AND quote_id = ?", tenantId, quoteId);
        for (var index = 0; index < lines.size(); index++) {
            var line = lines.get(index);
            var quantity = line.quantity().setScale(2, RoundingMode.HALF_UP);
            var rate = line.rate().setScale(2, RoundingMode.HALF_UP);
            jdbcTemplate.update("""
                    INSERT INTO quote_lines (
                        tenant_id, quote_id, description, quantity, unit, rate, amount, sort_order, created_by, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, tenantId, quoteId, line.description().trim(), quantity, blankToNull(line.unit()),
                    rate, quantity.multiply(rate).setScale(2, RoundingMode.HALF_UP), index + 1, actorUserId, actorUserId);
        }
    }

    private Totals totals(UpsertQuoteRequest request, BigDecimal defaultTaxRate) {
        var subtotal = request.lines().stream()
                .map(line -> line.quantity().multiply(line.rate()))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        var taxRate = (request.taxRate() == null ? defaultTaxRate : request.taxRate()).setScale(4, RoundingMode.HALF_UP);
        if (taxRate.signum() < 0 || taxRate.compareTo(BigDecimal.ONE) > 0) {
            throw new BadRequestException("Tax rate must be between 0 and 1.");
        }
        var tax = subtotal.multiply(taxRate).setScale(2, RoundingMode.HALF_UP);
        return new Totals(subtotal, taxRate, tax, subtotal.add(tax));
    }

    private void validateReferences(UUID tenantId, UpsertQuoteRequest request) {
        if (request.customerId() == null) {
            if (blankToNull(request.adhocCustomerName()) == null) {
                throw new BadRequestException("Select a client or enter a one-time client name.");
            }
        } else {
            var customerCount = jdbcTemplate.queryForObject("SELECT count(*)::int FROM customers WHERE tenant_id = ? AND id = ?", Integer.class, tenantId, request.customerId());
            if (customerCount == null || customerCount == 0) {
                throw new BadRequestException("Select a valid client.");
            }
        }
        if (request.propertyId() != null) {
            if (request.customerId() == null) {
                throw new BadRequestException("A saved property requires a saved client.");
            }
            var propertyCount = jdbcTemplate.queryForObject("""
                    SELECT count(*)::int FROM properties WHERE tenant_id = ? AND id = ? AND customer_id = ?
                    """, Integer.class, tenantId, request.propertyId(), request.customerId());
            if (propertyCount == null || propertyCount == 0) {
                throw new BadRequestException("The selected property must belong to the quote client.");
            }
        }
        if (request.serviceTypeId() != null) {
            var serviceCount = jdbcTemplate.queryForObject("SELECT count(*)::int FROM service_types WHERE tenant_id = ? AND id = ?", Integer.class, tenantId, request.serviceTypeId());
            if (serviceCount == null || serviceCount == 0) {
                throw new BadRequestException("Select a valid service.");
            }
        }
    }

    private String nextQuoteNumber(UUID tenantId, LocalDate date) {
        var sequence = jdbcTemplate.queryForObject("""
                INSERT INTO quote_daily_sequences (tenant_id, sequence_date, last_value)
                VALUES (?, ?, 1)
                ON CONFLICT (tenant_id, sequence_date)
                DO UPDATE SET last_value = quote_daily_sequences.last_value + 1
                RETURNING last_value
                """, Integer.class, tenantId, Date.valueOf(date));
        return "Q-" + date.toString().replace("-", "") + "-" + String.format("%04d", sequence);
    }

    private void requireEnabled(UUID tenantId) {
        if (!isEnabled(tenantId)) {
            throw new ResourceNotFoundException("Quote management is not enabled for this tenant.");
        }
    }

    private boolean isEnabled(UUID tenantId) {
        var count = jdbcTemplate.queryForObject("""
                SELECT count(*)::int FROM tenant_modules WHERE tenant_id = ? AND module_code = ? AND enabled = true
                """, Integer.class, tenantId, MODULE_CODE);
        return count != null && count > 0;
    }

    private QuoteDto requiredQuote(List<QuoteDto> quotes) {
        if (quotes.isEmpty()) {
            throw new ResourceNotFoundException("Quote not found.");
        }
        return quotes.getFirst();
    }

    private void validateDates(LocalDate issueDate, LocalDate validUntil) {
        if (validUntil != null && validUntil.isBefore(issueDate)) {
            throw new BadRequestException("Valid until date cannot be before the issue date.");
        }
    }

    private void expireIfNeeded(QuoteDto quote) {
        if (quote.validUntil() != null && quote.validUntil().isBefore(LocalDate.now()) && List.of("SENT", "VIEWED").contains(quote.status())) {
            jdbcTemplate.update("UPDATE quotes SET status = 'EXPIRED', updated_at = now() WHERE id = ?", quote.id());
            throw new BadRequestException("This quote has expired.");
        }
    }

    private UUID tenantIdForQuote(UUID quoteId) {
        return jdbcTemplate.queryForObject("SELECT tenant_id FROM quotes WHERE id = ?", UUID.class, quoteId);
    }

    private String publicResponseUrl(UUID tenantId, String token) {
        var settings = tenantSettingsOperations.settings(tenantId);
        if (publicUrls.rootDomain() != null && !publicUrls.rootDomain().isBlank() && settings.portalSubdomain() != null && !settings.portalSubdomain().isBlank()) {
            return "https://" + settings.portalSubdomain() + ".app." + publicUrls.rootDomain().trim() + "/quote-response/" + token;
        }
        var base = firstNonBlank(publicUrls.tenantPortal(), "http://localhost:4500");
        return base.replaceAll("/+$", "") + "/quote-response/" + token;
    }


    private String workOrderDescription(QuoteDto quote) {
        var builder = new StringBuilder();
        if (quote.scope() != null) {
            builder.append(quote.scope()).append("\n\n");
        }
        builder.append("Converted from quote ").append(quote.quoteNumber()).append(".\n");
        for (var line : quote.lines()) {
            builder.append("- ").append(line.description()).append(" (")
                    .append(line.quantity().stripTrailingZeros().toPlainString()).append(" ")
                    .append(line.unit() == null ? "" : line.unit()).append(")\n");
        }
        return builder.toString().trim();
    }

    private String newToken() {
        var bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hash(String token) {
        if (token == null || token.isBlank()) {
            throw new ResourceNotFoundException("Quote not found.");
        }
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }

    private java.time.Instant instant(ResultSet rs, String column) throws SQLException {
        var value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private Date sqlDate(LocalDate value) {
        return value == null ? null : Date.valueOf(value);
    }

    private String money(BigDecimal value) {
        return "$" + value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String adhocValue(UUID linkedRecordId, String value) {
        return linkedRecordId == null ? blankToNull(value) : null;
    }

    private String firstNonBlank(String... values) {
        for (var value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private String escape(String value) {
        return value == null ? "" : value.replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;");
    }

    private record Totals(BigDecimal subtotal, BigDecimal taxRate, BigDecimal taxAmount, BigDecimal total) {
    }
}
