package com.lorne.platform.quote.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.lorne.platform.LornePublicUrlProperties;
import com.lorne.platform.audit.AuditWriter;
import com.lorne.platform.notification.OutboundEmailMessage;
import com.lorne.platform.notification.OutboundMailDeliveryResult;
import com.lorne.platform.notification.OutboundMailOperations;
import com.lorne.platform.notification.EmailLogoRenderer;
import com.lorne.platform.notification.QuoteEmailResendOperations;
import com.lorne.platform.notification.internal.service.EmailTemplateService;
import com.lorne.platform.notification.internal.service.EmailDeliveryLogService;
import com.lorne.platform.notification.internal.dto.UpdateEmailTemplateRequest;
import com.lorne.platform.audit.internal.service.TenantAuditService;
import org.springframework.beans.factory.ObjectProvider;
import com.lorne.platform.quote.internal.dto.QuoteDecisionRequest;
import com.lorne.platform.quote.internal.dto.SendQuoteRequest;
import com.lorne.platform.quote.internal.dto.UpsertQuoteRequest;
import com.lorne.platform.shared.exception.BadRequestException;
import com.lorne.platform.tenant.TenantSettingsOperations;
import com.lorne.platform.tenant.TenantSettingsView;
import com.lorne.platform.workorder.QuoteWorkOrderOperations;
import com.lorne.platform.workorder.QuoteWorkOrderResult;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.apache.pdfbox.Loader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.core.io.FileSystemResource;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class QuoteSharingIntegrationTest {
    @Container static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");
    private final UUID tenant = UUID.randomUUID();
    private final UUID actor = UUID.randomUUID();
    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private QuoteManagementService service;
    private OutboundMailOperations mail;
    private QuoteWorkOrderOperations workOrders;
    private UpsertQuoteRequest request;
    private EmailTemplateService templates;
    private EmailDeliveryLogService emailLogs;
    private TenantAuditService audit;

    @BeforeEach
    void setup() throws Exception {
        var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS citext");
        jdbc.execute("CREATE TABLE tenants(id uuid PRIMARY KEY)");
        jdbc.execute("CREATE TABLE app_users(id uuid PRIMARY KEY, display_name text, email text)");
        jdbc.execute("CREATE TABLE customers(id uuid PRIMARY KEY, tenant_id uuid, display_name text, email citext, phone text)");
        jdbc.execute("CREATE TABLE properties(id uuid PRIMARY KEY, tenant_id uuid, customer_id uuid, name text, address_line1 text, address_line2 text, city text, province_code text, postal_code text)");
        jdbc.execute("CREATE TABLE service_types(id uuid PRIMARY KEY, tenant_id uuid, name text)");
        jdbc.execute("CREATE TABLE work_orders(id uuid PRIMARY KEY, tenant_id uuid, work_order_number text, customer_id uuid, service_type_id uuid, title text)");
        jdbc.execute("CREATE TABLE invoices(id uuid PRIMARY KEY, tenant_id uuid, invoice_number text, work_order_id uuid, customer_id uuid)");
        jdbc.execute("CREATE TABLE email_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, template_key text, name text, subject text, body text, active boolean DEFAULT true, created_by uuid, updated_by uuid, updated_at timestamptz DEFAULT now(), UNIQUE(tenant_id, template_key))");
        jdbc.execute("CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), actor_user_id uuid REFERENCES app_users(id), action text, resource_type text, resource_id uuid, metadata jsonb, created_at timestamptz DEFAULT now())");
        jdbc.execute("CREATE TABLE email_delivery_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, template_id uuid, invoice_id uuid, work_order_id uuid, customer_id uuid, recipient_email text, cc_emails text, bcc_emails text, subject text, body text, status text, provider_message text, sent_at timestamptz, delivery_mode text, created_by uuid, updated_by uuid, created_at timestamptz DEFAULT now())");
        try (var connection = dataSource.getConnection()) {
            var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve("V76__quote_management.sql")));
            // PostgreSQL dollar-quoted functions need the complete script, without semicolon splitting.
            jdbc.execute(Files.readString(migrations.resolve("V77__quote_secure_sharing.sql")));
        }
        jdbc.update("INSERT INTO tenants VALUES (?)", tenant);
        jdbc.update("INSERT INTO app_users VALUES (?, 'Tenant Admin', 'admin@example.com')", actor);
        jdbc.update("INSERT INTO tenant_modules (tenant_id, module_code, enabled) VALUES (?, 'QUOTES', true)", tenant);
        var manager = new DataSourceTransactionManager(dataSource);
        transaction = new TransactionTemplate(manager);
        var encoder = new BCryptPasswordEncoder(4);
        var settings = mock(TenantSettingsView.class);
        when(settings.invoiceTaxRate()).thenReturn(new BigDecimal(".13"));
        when(settings.invoiceBrandName()).thenReturn("Platinum Services");
        when(settings.themePrimaryColor()).thenReturn("#0f766e");
        when(settings.portalSubdomain()).thenReturn("prs");
        var settingsOperations = mock(TenantSettingsOperations.class);
        when(settingsOperations.settings(tenant)).thenReturn(settings);
        mail = mock(OutboundMailOperations.class);
        when(mail.send(eq(tenant), any())).thenReturn(new OutboundMailDeliveryResult("SENT", "test", Instant.now(), "TEST", "sender@example.com", null));
        workOrders = mock(QuoteWorkOrderOperations.class);
        var mapper = new ObjectMapper().findAndRegisterModules();
        var auditWriter = new AuditWriter(jdbc, mapper);
        templates = new EmailTemplateService(jdbc, auditWriter);
        audit = new TenantAuditService(jdbc, mapper);
        var logo = mock(EmailLogoRenderer.class);
        when(logo.render(any(), any(), any())).thenReturn(new EmailLogoRenderer.RenderedLogo("<strong>Platinum Services</strong>", "", List.of()));
        service = new QuoteManagementService(jdbc, auditWriter, settingsOperations, mail,
                workOrders, new QuotePdfService(null), encoder,
                new QuoteAccessService(jdbc, encoder, manager), mapper,
                new LornePublicUrlProperties("http://localhost:4500", "maplepropertyservices.ca"), templates, logo);
        @SuppressWarnings("unchecked") var quoteProvider = (ObjectProvider<QuoteEmailResendOperations>) mock(ObjectProvider.class);
        when(quoteProvider.getObject()).thenReturn(service);
        emailLogs = new EmailDeliveryLogService(jdbc, auditWriter, mail, settingsOperations, logo, quoteProvider);
        request = new UpsertQuoteRequest(null, "One-time Client", "client@example.com", "416-555-0100", null,
                "Test Property", "22 Bayview Ridge, Mississauga", null, "Pump replacement", "Supply and install pump",
                LocalDate.now(), LocalDate.now().plusDays(30), new BigDecimal(".13"), "Call before arriving", "Subject to approval",
                List.of(new UpsertQuoteRequest.Line(null, "Pool pump", BigDecimal.ONE, "each", new BigDecimal("250"))));
    }

    @Test
    void protectsPublicPdfAndApprovalThenLocksContentAtApiAndDatabase() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var token = token(share.publicUrl());
        assertThatThrownBy(() -> service.publicQuote(token, "wrong")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.publicPdf(token, null)).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.decide(token, "wrong", true, new QuoteDecisionRequest("Grace", "Approved")))
                .isInstanceOf(ResponseStatusException.class);
        var publicQuote = transaction.execute(status -> service.publicQuote(token, "ClientPassword123"));
        assertThat(publicQuote.quote().customerName()).isEqualTo("One-time Client");
        try (var pdf = Loader.loadPDF(service.publicPdf(token, "ClientPassword123"))) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
        }
        var approved = transaction.execute(status -> service.decide(token, "ClientPassword123", true,
                new QuoteDecisionRequest("Grace", "Please call before the visit.")));
        assertThat(approved.quote().status()).isEqualTo("APPROVED");
        assertThat(approved.quote().approvalComment()).isEqualTo("Please call before the visit.");
        assertThatThrownBy(() -> transaction.execute(status -> service.update(tenant, actor, quote.id(), request))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> transaction.execute(status -> service.voidQuote(tenant, actor, quote.id()))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> transaction.execute(status -> service.share(tenant, actor, quote.id(), "NewPassword123"))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET title = 'Changed' WHERE id = ?", quote.id())).hasMessageContaining("locked");
        assertThatThrownBy(() -> jdbc.update("UPDATE quote_lines SET rate = 0 WHERE quote_id = ?", quote.id())).hasMessageContaining("locked");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM quote_lines WHERE quote_id = ?", quote.id())).hasMessageContaining("locked");
        var repeat = transaction.execute(status -> service.decide(token, "ClientPassword123", false, new QuoteDecisionRequest("Other", "Changed")));
        assertThat(repeat.quote().approvalName()).isEqualTo("Grace");
        assertThat(repeat.quote().status()).isEqualTo("APPROVED");
    }

    @Test
    void sendsPdfAndLinkWithoutStoringPlaintextPasswordInEmailAudit() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var result = transaction.execute(status -> service.send(tenant, actor, quote.id(),
                new SendQuoteRequest("client@example.com", "Your quote", "Please review", "ClientPassword123")));
        var message = ArgumentCaptor.forClass(OutboundEmailMessage.class);
        verify(mail).send(eq(tenant), message.capture());
        assertThat(message.getValue().body()).contains(result.publicUrl()).doesNotContain("ClientPassword123");
        assertThat(message.getValue().attachments()).hasSize(1);
        assertThat(message.getValue().attachments().getFirst().contentType()).isEqualTo("application/pdf");
        try (var pdf = Loader.loadPDF(message.getValue().attachments().getFirst().content())) {
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
        }
        var hash = jdbc.queryForObject("SELECT access_password_hash FROM quotes WHERE id = ?", String.class, quote.id());
        assertThat(hash).startsWith("$2").doesNotContain("ClientPassword123");
        assertThat(result.publicUrl()).startsWith("https://prs.app.maplepropertyservices.ca/quote-response/");
        var replacement = transaction.execute(status -> service.share(tenant, actor, quote.id(), "SecondPassword123"));
        assertThatThrownBy(() -> service.publicQuote(token(result.publicUrl()), "ClientPassword123")).isInstanceOf(ResponseStatusException.class);
        assertThat(transaction.execute(status -> service.publicQuote(token(replacement.publicUrl()), "SecondPassword123")).quote().id()).isEqualTo(quote.id());
    }

    @Test
    void persistsFailedAttemptsAndLimitsPasswordGuessing() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token(share.publicUrl()), "wrong")))
                    .isInstanceOf(ResponseStatusException.class);
        }
        assertThat(jdbc.queryForObject("SELECT access_failed_attempts FROM quotes WHERE id = ?", Integer.class, quote.id())).isEqualTo(5);
        assertThatThrownBy(() -> service.publicQuote(token(share.publicUrl()), "ClientPassword123"))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(429));
    }

    @Test
    void freezesClientDetailsAndKeepsTheFirstConcurrentResponse() throws Exception {
        var customerId = UUID.randomUUID();
        jdbc.update("INSERT INTO customers(id, tenant_id, display_name, email) VALUES (?, ?, 'Original Client', 'client@example.com')", customerId, tenant);
        var savedClientRequest = new UpsertQuoteRequest(customerId, null, null, null, null, null, null, null,
                request.title(), request.scope(), request.issueDate(), request.validUntil(), request.taxRate(), request.notes(), request.terms(), request.lines());
        var quote = transaction.execute(status -> service.create(tenant, actor, savedClientRequest));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        jdbc.update("UPDATE customers SET display_name = 'Changed Client', email = 'changed@example.com' WHERE id = ?", customerId);
        assertThat(service.get(tenant, quote.id()).customerName()).isEqualTo("Original Client");
        assertThat(service.get(tenant, quote.id()).customerEmail()).isEqualTo("client@example.com");
        var token = token(share.publicUrl());
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var ready = new java.util.concurrent.CountDownLatch(2);
            var start = new java.util.concurrent.CountDownLatch(1);
            var first = executor.submit(() -> {
                ready.countDown(); start.await();
                return transaction.execute(status -> service.decide(token, "ClientPassword123", true, new QuoteDecisionRequest("Grace", "First notes")));
            });
            var second = executor.submit(() -> {
                ready.countDown(); start.await();
                return transaction.execute(status -> service.decide(token, "ClientPassword123", true, new QuoteDecisionRequest("Martin", "Second notes")));
            });
            assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var responseOne = first.get(10, java.util.concurrent.TimeUnit.SECONDS).quote();
            var responseTwo = second.get(10, java.util.concurrent.TimeUnit.SECONDS).quote();
            assertThat(responseOne.approvalName()).isEqualTo(responseTwo.approvalName());
            assertThat(responseOne.approvalComment()).isEqualTo(responseTwo.approvalComment());
        }
    }

    @Test
    void convertsOneTimePropertyQuoteWithoutChangingAcceptedDocument() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        transaction.execute(status -> service.decide(token(share.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Grace", "Approved")));
        var propertyId = UUID.randomUUID();
        jdbc.update("INSERT INTO properties(id, tenant_id, name) VALUES (?, ?, 'Saved operational property')", propertyId, tenant);
        when(workOrders.createFromQuote(eq(tenant), eq(actor), any())).thenAnswer(invocation -> {
            var id = UUID.randomUUID();
            jdbc.update("INSERT INTO work_orders(id, tenant_id, work_order_number) VALUES (?, ?, '261011-0001')", id, tenant);
            return new QuoteWorkOrderResult(id, "261011-0001");
        });
        var converted = transaction.execute(status -> service.convert(tenant, actor, quote.id(), propertyId));
        assertThat(converted.status()).isEqualTo("CONVERTED");
        assertThat(converted.propertyId()).isNull();
        assertThat(converted.propertyName()).isEqualTo("Test Property");
        assertThat(converted.propertyAddress()).isEqualTo("22 Bayview Ridge, Mississauga");
        assertThat(converted.scope()).isEqualTo(request.scope());
        assertThat(converted.approvalName()).isEqualTo("Grace");
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET notes = 'Changed' WHERE id = ?", quote.id())).hasMessageContaining("locked");
    }

    private String token(String url) { return url.substring(url.lastIndexOf('/') + 1); }

    @Test
    void usesSavedTemplateAndAuditsViewsAndApprovalWithClientNotes() {
        transaction.execute(status -> templates.updateQuoteTemplate(tenant, actor, new UpdateEmailTemplateRequest(
                "Estimate {{quoteNumber}} for {{clientName}}", "<p>Custom offer: {{quoteTitle}} - {{quoteTotal}}. {{message}}</p>")));
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var result = transaction.execute(status -> service.send(tenant, actor, quote.id(),
                new SendQuoteRequest(null, null, "Call us with questions", "ClientPassword123")));
        var message = ArgumentCaptor.forClass(OutboundEmailMessage.class);
        verify(mail).send(eq(tenant), message.capture());
        assertThat(message.getValue().subject()).isEqualTo("Estimate " + quote.quoteNumber() + " for One-time Client");
        assertThat(message.getValue().body()).contains("Custom offer: Pump replacement", "$282.50", "Call us with questions", result.publicUrl()).doesNotContain("{{");
        var email = emailLogs.list(tenant, 100).getFirst();
        assertThat(email.communicationType()).isEqualTo("QUOTE_EMAIL");
        assertThat(email.quoteId()).isEqualTo(quote.id());
        assertThat(email.quoteNumber()).isEqualTo(quote.quoteNumber());
        transaction.execute(status -> service.publicQuote(token(result.publicUrl()), "ClientPassword123"));
        transaction.execute(status -> service.publicQuote(token(result.publicUrl()), "ClientPassword123"));
        transaction.execute(status -> service.decide(token(result.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Grace", "Please schedule Monday")));
        transaction.execute(status -> service.decide(token(result.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Other", "Replacement")));
        var entries = audit.list(tenant, 100, "QUOTE", quote.id());
        assertThat(entries.stream().filter(entry -> entry.action().equals("QUOTE_VIEWED"))).hasSize(2);
        assertThat(entries.stream().filter(entry -> entry.action().equals("QUOTE_APPROVED"))).hasSize(1);
        var approved = entries.stream().filter(entry -> entry.action().equals("QUOTE_APPROVED")).findFirst().orElseThrow();
        assertThat(approved.metadata()).containsEntry("clientName", "Grace").containsEntry("clientNotes", "Please schedule Monday");
        assertThat(approved.createdAt()).isNotNull();
        var sent = entries.stream().filter(entry -> entry.action().equals("QUOTE_EMAIL_SENT")).findFirst().orElseThrow();
        assertThat(sent.actorName()).isEqualTo("Tenant Admin");
        assertThat(sent.metadata()).containsEntry("recipientEmail", "client@example.com").containsEntry("status", "SENT");
        assertThat(entries.toString()).doesNotContain("ClientPassword123");
        assertThat(audit.list(UUID.randomUUID(), 100, "QUOTE", quote.id())).isEmpty();
    }

    @Test
    void resendsQuoteFromEmailAuditWithPdfAndRejectsStaleLinks() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, "ClientPassword123")));
        var original = emailLogs.list(tenant, 100).getFirst();
        var resend = transaction.execute(status -> emailLogs.resend(tenant, actor, original.id(), null));
        assertThat(resend.quoteId()).isEqualTo(quote.id());
        assertThat(resend.deliveryMode()).isEqualTo("RESEND");
        var message = ArgumentCaptor.forClass(OutboundEmailMessage.class);
        verify(mail, org.mockito.Mockito.times(2)).send(eq(tenant), message.capture());
        assertThat(message.getAllValues().get(1).attachments()).hasSize(1);
        assertThat(audit.list(tenant, 100, "QUOTE", quote.id()).stream().map(entry -> entry.action())).contains("QUOTE_EMAIL_RESENT");
        transaction.execute(status -> service.share(tenant, actor, quote.id(), "SecondPassword123"));
        assertThatThrownBy(() -> transaction.execute(status -> emailLogs.resend(tenant, actor, original.id(), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("inactive quote link");
    }

    @Test
    void recordsFailedDeliveryWithoutClaimingEmailWasSent() {
        when(mail.send(eq(tenant), any())).thenReturn(new OutboundMailDeliveryResult("FAILED", "SMTP rejected recipient", null, "TEST", null, null));
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, "ClientPassword123")));
        assertThat(emailLogs.list(tenant, 100).getFirst().status()).isEqualTo("FAILED");
        var entries = audit.list(tenant, 100, "QUOTE", quote.id());
        assertThat(entries.stream().map(entry -> entry.action())).contains("QUOTE_EMAIL_FAILED").doesNotContain("QUOTE_EMAIL_SENT");
    }
}
