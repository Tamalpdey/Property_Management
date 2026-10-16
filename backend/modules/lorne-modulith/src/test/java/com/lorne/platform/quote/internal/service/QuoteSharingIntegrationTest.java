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
    private QuoteSiteVisitService site;
    private com.lorne.platform.document.DocumentStorageService storage;
    private java.time.Clock clock;
    private TenantSettingsView settings;
    private QuoteTemplateService quoteTemplates;

    @Test
    void secureSharingMigrationUpgradesLegacyQuoteSchemaWithoutLosingPublishedQuotes() throws Exception {
        jdbc.execute("DROP TRIGGER quotes_approval_lock ON quotes");
        jdbc.execute("DROP TRIGGER quote_lines_approval_lock ON quote_lines");
        jdbc.execute("DROP FUNCTION protect_approved_quote()");
        jdbc.execute("DROP FUNCTION protect_approved_quote_lines()");
        jdbc.execute("""
                ALTER TABLE quotes
                    DROP CONSTRAINT ck_quotes_customer_source,
                    DROP CONSTRAINT ck_quotes_property_source,
                    DROP COLUMN adhoc_customer_name,
                    DROP COLUMN adhoc_customer_email,
                    DROP COLUMN adhoc_customer_phone,
                    DROP COLUMN adhoc_property_name,
                    DROP COLUMN adhoc_property_address,
                    DROP COLUMN access_password_hash,
                    DROP COLUMN access_failed_attempts,
                    DROP COLUMN access_locked_until,
                    DROP COLUMN published_details,
                    ALTER COLUMN customer_id SET NOT NULL
                """);
        var customer = UUID.randomUUID();
        var property = UUID.randomUUID();
        var serviceType = UUID.randomUUID();
        var approvedQuote = UUID.randomUUID();
        jdbc.update("INSERT INTO customers VALUES (?, ?, 'Existing Client', 'existing@example.com', '416-555-0100')", customer, tenant);
        jdbc.update("""
                INSERT INTO properties VALUES (?, ?, ?, 'Existing Property', '22 Bayview Ridge', '', 'Mississauga', 'ON', 'L5G 1A1')
                """, property, tenant, customer);
        jdbc.update("INSERT INTO service_types VALUES (?, ?, 'Pump replacement')", serviceType, tenant);
        jdbc.update("""
                INSERT INTO quotes(id, tenant_id, quote_number, customer_id, property_id, service_type_id, title, status, total)
                VALUES (?, ?, 'Q-LEGACY-0001', ?, ?, ?, 'Legacy approved quote', 'APPROVED', 250)
                """, approvedQuote, tenant, customer, property, serviceType);

        jdbc.execute(Files.readString(Path.of("../../../db-migration/src/main/resources/db/migration/postgresql/V77__quote_secure_sharing.sql")));

        var snapshot = jdbc.queryForMap("SELECT published_details->>'customerName' AS customer_name, published_details->>'propertyAddress' AS address, published_details->>'serviceName' AS service_name, status, total FROM quotes WHERE id = ?", approvedQuote);
        assertThat(snapshot).containsEntry("customer_name", "Existing Client")
                .containsEntry("address", "22 Bayview Ridge, Mississauga, ON, L5G 1A1")
                .containsEntry("service_name", "Pump replacement")
                .containsEntry("status", "APPROVED")
                .containsEntry("total", new BigDecimal("250.00"));
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET title = 'Changed' WHERE id = ?", approvedQuote))
                .hasMessageContaining("locked");
        var adhocQuote = transaction.execute(status -> service.create(tenant, actor, request));
        assertThat(adhocQuote.customerName()).isEqualTo("One-time Client");
        assertThat(adhocQuote.propertyName()).isEqualTo("Test Property");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM quotes", Integer.class)).isEqualTo(2);
    }

    @BeforeEach
    void setup() throws Exception {
        var dataSource = new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("DROP SCHEMA public CASCADE");
        jdbc.execute("CREATE SCHEMA public");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS citext");
        jdbc.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto");
        jdbc.execute("CREATE TABLE tenants(id uuid PRIMARY KEY, status text DEFAULT 'ACTIVE')");
        jdbc.execute("CREATE TABLE app_users(id uuid PRIMARY KEY, display_name text, email text)");
        jdbc.execute("CREATE TABLE customers(id uuid PRIMARY KEY, tenant_id uuid, display_name text, email citext, phone text)");
        jdbc.execute("CREATE TABLE properties(id uuid PRIMARY KEY, tenant_id uuid, customer_id uuid, name text, address_line1 text, address_line2 text, city text, province_code text, postal_code text)");
        jdbc.execute("CREATE TABLE service_types(id uuid PRIMARY KEY, tenant_id uuid, name text)");
        jdbc.execute("CREATE TABLE work_orders(id uuid PRIMARY KEY, tenant_id uuid, work_order_number text, customer_id uuid, service_type_id uuid, title text)");
        jdbc.execute("CREATE TABLE invoices(id uuid PRIMARY KEY, tenant_id uuid, invoice_number text, work_order_id uuid, customer_id uuid)");
        jdbc.execute("CREATE TABLE documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, owner_type text, owner_id uuid, bucket text, object_key text, content_type text, byte_size bigint)");
        jdbc.execute("CREATE TABLE email_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, template_key text, name text, subject text, body text, active boolean DEFAULT true, created_by uuid, updated_by uuid, updated_at timestamptz DEFAULT now(), UNIQUE(tenant_id, template_key))");
        jdbc.execute("CREATE TABLE audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id), actor_user_id uuid REFERENCES app_users(id), action text, resource_type text, resource_id uuid, metadata jsonb, created_at timestamptz DEFAULT now())");
        jdbc.execute("CREATE TABLE email_delivery_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, template_id uuid, invoice_id uuid, work_order_id uuid, customer_id uuid, recipient_email text, cc_emails text, bcc_emails text, subject text, body text, status text, provider_message text, sent_at timestamptz, delivery_mode text, created_by uuid, updated_by uuid, created_at timestamptz DEFAULT now())");
        try (var connection = dataSource.getConnection()) {
            var migrations = Path.of("../../../db-migration/src/main/resources/db/migration/postgresql");
            ScriptUtils.executeSqlScript(connection, new FileSystemResource(migrations.resolve("V76__quote_management.sql")));
            // PostgreSQL dollar-quoted functions need the complete script, without semicolon splitting.
            jdbc.execute(Files.readString(migrations.resolve("V77__quote_secure_sharing.sql")));
            jdbc.execute(Files.readString(migrations.resolve("V79__stable_quote_share_links.sql")));
            jdbc.execute(Files.readString(migrations.resolve("V81__quote_site_capture_and_photos.sql")));
            jdbc.execute(Files.readString(migrations.resolve("V85__quote_pricing_templates.sql")));
        }
        jdbc.update("INSERT INTO tenants(id) VALUES (?)", tenant);
        jdbc.update("INSERT INTO app_users VALUES (?, 'Tenant Admin', 'admin@example.com')", actor);
        jdbc.update("INSERT INTO tenant_modules (tenant_id, module_code, enabled) VALUES (?, 'QUOTES', true)", tenant);
        var manager = new DataSourceTransactionManager(dataSource);
        transaction = new TransactionTemplate(manager);
        var encoder = new BCryptPasswordEncoder(4);
        settings = mock(TenantSettingsView.class);
        when(settings.timezone()).thenReturn("America/Toronto");
        clock = mock(java.time.Clock.class);
        when(clock.instant()).thenAnswer(invocation -> Instant.now());
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
        quoteTemplates = new QuoteTemplateService(jdbc, auditWriter);
        templates = new EmailTemplateService(jdbc, auditWriter);
        audit = new TenantAuditService(jdbc, mapper);
        var logo = mock(EmailLogoRenderer.class);
        when(logo.render(any(), any(), any())).thenReturn(new EmailLogoRenderer.RenderedLogo("<strong>Platinum Services</strong>", "", List.of()));
        service = new QuoteManagementService(jdbc, auditWriter, settingsOperations, mail,
                workOrders, new QuotePdfService(null), encoder,
                new QuoteAccessService(jdbc, encoder, manager), mapper,
                new LornePublicUrlProperties("http://localhost:4500", "maplepropertyservices.ca"), templates, logo, clock);
        storage = mock(com.lorne.platform.document.DocumentStorageService.class);
        when(storage.storeQuotePhoto(any(), any(), any(), any(), any())).thenAnswer(invocation -> {
            var document = UUID.randomUUID();
            jdbc.update("INSERT INTO documents(id, tenant_id, owner_type, owner_id, bucket, object_key, content_type, byte_size) VALUES (?, ?, 'QUOTE', ?, 'test', ?, 'image/jpeg', 120)",
                    document, invocation.getArgument(0), invocation.getArgument(2), document.toString());
            return document;
        });
        when(storage.quotePhoto(any(), any(), any())).thenReturn(new com.lorne.platform.document.DocumentStorageService.StoredLogo("image/jpeg", new byte[]{1, 2, 3}));
        site = new QuoteSiteVisitService(jdbc, service, new QuoteAccessService(jdbc, encoder, manager), storage, settingsOperations,
                new LornePublicUrlProperties("http://localhost:4500", "maplepropertyservices.ca"), encoder, auditWriter);
        @SuppressWarnings("unchecked") var quoteProvider = (ObjectProvider<QuoteEmailResendOperations>) mock(ObjectProvider.class);
        when(quoteProvider.getObject()).thenReturn(service);
        emailLogs = new EmailDeliveryLogService(jdbc, auditWriter, mail, settingsOperations, logo, quoteProvider);
        request = new UpsertQuoteRequest(null, "One-time Client", "client@example.com", "416-555-0100", null,
                "Test Property", "22 Bayview Ridge, Mississauga", null, "Pump replacement", "Supply and install pump",
                LocalDate.now(), LocalDate.now().plusDays(30), new BigDecimal(".13"), "Call before arriving", "Subject to approval",
                List.of(new UpsertQuoteRequest.Line(null, "Pool pump", BigDecimal.ONE, "each", new BigDecimal("250"))));
    }

    @Test
    void quoteNumbersUseTenantCalendarDatesAndDailySequencesNotServerDates() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-15T01:30:00Z"));
        var automatic = new UpsertQuoteRequest(null, "Client", "client@example.com", null, null, null, null,
                null, "Local date quote", null, null, null, new BigDecimal(".13"), null, null, request.lines());
        var first = transaction.execute(status -> service.create(tenant, actor, automatic));
        var second = transaction.execute(status -> service.create(tenant, actor, automatic));
        assertThat(first.issueDate()).isEqualTo(LocalDate.of(2026, 10, 14));
        assertThat(first.quoteNumber()).isEqualTo("261014-0001");
        assertThat(second.quoteNumber()).isEqualTo("261014-0002");
        when(settings.timezone()).thenReturn("Pacific/Auckland");
        var next = transaction.execute(status -> service.create(tenant, actor, automatic));
        assertThat(next.quoteNumber()).isEqualTo("261015-0001");
        assertThat(service.get(tenant, first.id()).quoteNumber()).isEqualTo(first.quoteNumber());
        var storedInstant = first.createdAt();
        jdbc.execute("SET TIME ZONE 'Pacific/Auckland'");
        assertThat(service.get(tenant, first.id()).createdAt()).isEqualTo(storedInstant);
        assertThat(first.createdAt()).isNotNull();
    }

    @Test
    void publicQuoteIncludesCompanyProfileAddressAndHstWithoutInvoiceVisibilityDependency() {
        when(settings.addressLine1()).thenReturn("130 Industry Street");
        when(settings.addressLine2()).thenReturn("Unit 33");
        when(settings.city()).thenReturn("Toronto");
        when(settings.provinceCode()).thenReturn("ON");
        when(settings.postalCode()).thenReturn("M6M 5G3");
        when(settings.countryCode()).thenReturn("CA");
        when(settings.invoiceShowCompanyAddress()).thenReturn(false);
        when(settings.taxRegistrationNumber()).thenReturn("123456789 RT0001");
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var link = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var view = transaction.execute(status -> service.publicQuote(token(link.publicUrl()), "ClientPassword123"));
        assertThat(view.companyAddress()).isEqualTo("Unit 33, 130 Industry Street, Toronto, ON, M6M 5G3, CA");
        assertThat(view.taxRegistrationNumber()).isEqualTo("123456789 RT0001");
        assertThat(view.quote().customerEmail()).isEqualTo("client@example.com");
        assertThat(view.quote().propertyAddress()).isEqualTo("22 Bayview Ridge, Mississauga");
    }

    @Test
    void shortNumberFormatContinuesExistingSequenceWithoutRenumberingHistoricalQuotes() {
        var first = transaction.execute(status -> service.create(tenant, actor, request));
        var historicalNumber = "Q-" + request.issueDate().toString().replace("-", "") + "-0001";
        jdbc.update("UPDATE quotes SET quote_number = ? WHERE id = ?", historicalNumber, first.id());
        var second = transaction.execute(status -> service.create(tenant, actor, request));
        assertThat(second.quoteNumber()).isEqualTo(request.issueDate().format(java.time.format.DateTimeFormatter.ofPattern("yyMMdd")) + "-0002");
        assertThat(service.get(tenant, first.id()).quoteNumber()).isEqualTo(historicalNumber);
    }

    @Test
    void quoteValidityEndsAtTenantMidnightIncludingWinterAndSummerOffsets() {
        for (var boundary : List.of("2026-10-15T04:00:00Z", "2026-01-15T05:00:00Z")) {
            var midnight = Instant.parse(boundary);
            var lastDay = midnight.atZone(java.time.ZoneId.of("America/Toronto")).toLocalDate().minusDays(1);
            when(clock.instant()).thenReturn(midnight.minusSeconds(1));
            var dated = new UpsertQuoteRequest(null, "Client", "client@example.com", null, null, null, null,
                    null, "End date quote", null, lastDay, lastDay, new BigDecimal(".13"), null, null, request.lines());
            var quote = transaction.execute(status -> service.create(tenant, actor, dated));
            var link = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
            assertThat(transaction.execute(status -> service.publicQuote(token(link.publicUrl()), "ClientPassword123")).timezone()).isEqualTo("America/Toronto");
            when(clock.instant()).thenReturn(midnight);
            assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token(link.publicUrl()), "ClientPassword123"))).hasMessageContaining("expired");
        }
    }

    @Test
    void disabledModuleBlocksManagementSharedViewsDecisionsPdfAndTemplates() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var token = token(share.publicUrl());
        jdbc.update("UPDATE tenant_modules SET enabled = false WHERE tenant_id = ?", tenant);
        assertThatThrownBy(() -> service.list(tenant, null, null)).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token, "ClientPassword123"))).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> transaction.execute(status -> service.publicPdf(token, "ClientPassword123"))).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> transaction.execute(status -> service.decide(token, "ClientPassword123", true, new QuoteDecisionRequest("Client", "Approve")))).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> templates.quoteTemplate(tenant, actor)).hasMessageContaining("not enabled");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM quotes", Integer.class)).isEqualTo(1);
        jdbc.update("UPDATE tenant_modules SET enabled = true WHERE tenant_id = ?", tenant);
        assertThat(transaction.execute(status -> service.publicQuote(token, "ClientPassword123")).quote().id()).isEqualTo(quote.id());
    }

    @Test
    void suspendedTenantCannotUseSharedQuoteLinks() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var share = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        jdbc.update("UPDATE tenants SET status = 'SUSPENDED' WHERE id = ?", tenant);
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token(share.publicUrl()), "ClientPassword123"))).hasMessageContaining("not enabled");
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
        assertThatThrownBy(() -> transaction.execute(status -> service.share(tenant, actor, quote.id(), "SecondPassword123")))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("original password");
        var repeat = transaction.execute(status -> service.share(tenant, actor, quote.id(), null));
        assertThat(repeat.publicUrl()).isEqualTo(result.publicUrl());
        assertThat(transaction.execute(status -> service.publicQuote(token(result.publicUrl()), "ClientPassword123")).quote().id()).isEqualTo(quote.id());
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

    @Test
    void tenantsStartWithItemizedAndCanBeAssignedOneOrBothTemplates() {
        assertThat(quoteTemplates.assignment(tenant).templateCodes()).containsExactly("ITEMIZED");
        assertThat(quoteTemplates.available(tenant)).singleElement().satisfies(template -> {
            assertThat(template.code()).isEqualTo("ITEMIZED");
            assertThat(template.defaultForTenant()).isTrue();
        });
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("ITEMIZED", "TOTAL_PRICE"), "TOTAL_PRICE")));
        assertThat(quoteTemplates.available(tenant)).extracting(template -> template.code()).containsExactly("TOTAL_PRICE", "ITEMIZED");
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("TOTAL_PRICE"), "TOTAL_PRICE")));
        assertThat(quoteTemplates.assignment(tenant).templateCodes()).containsExactly("TOTAL_PRICE");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM audit_logs WHERE action = 'TENANT_QUOTE_TEMPLATES_UPDATED'", Integer.class)).isEqualTo(2);
        var newTenant = UUID.randomUUID();
        jdbc.update("INSERT INTO tenants(id) VALUES (?)", newTenant);
        assertThat(quoteTemplates.assignment(newTenant).defaultCode()).isEqualTo("ITEMIZED");
    }

    @Test
    void rejectsInvalidAssignmentsAndUnassignedTemplateCreation() {
        for (var invalid : List.of(
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of(), "ITEMIZED"),
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("UNKNOWN"), "UNKNOWN"),
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("ITEMIZED", "ITEMIZED"), "ITEMIZED"),
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("ITEMIZED"), "TOTAL_PRICE"))) {
            assertThatThrownBy(() -> transaction.execute(status -> quoteTemplates.assign(tenant, actor, invalid)))
                    .isInstanceOf(BadRequestException.class);
        }
        assertThat(quoteTemplates.assignment(tenant).defaultCode()).isEqualTo("ITEMIZED");
        assertThatThrownBy(() -> transaction.execute(status -> service.create(tenant, actor, totalPriceRequest("TOTAL_PRICE", "100"))))
                .hasMessageContaining("not assigned");
        jdbc.update("UPDATE tenant_modules SET enabled = false WHERE tenant_id = ?", tenant);
        assertThatThrownBy(() -> quoteTemplates.available(tenant)).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> transaction.execute(status -> service.create(tenant, actor, request))).hasMessageContaining("not enabled");
    }

    @Test
    void totalPriceQuotesRenderShareApproveAndConvertWithoutPerLinePrices() throws Exception {
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("TOTAL_PRICE"), "TOTAL_PRICE")));
        var quote = transaction.execute(status -> service.create(tenant, actor, totalPriceRequest(null, "1000")));
        assertThat(quote.templateCode()).isEqualTo("TOTAL_PRICE");
        assertThat(quote.pricingMode()).isEqualTo("TOTAL_PRICE");
        assertThat(quote.subtotal()).isEqualByComparingTo("1000");
        assertThat(quote.taxAmount()).isEqualByComparingTo("130");
        assertThat(quote.total()).isEqualByComparingTo("1130");
        assertThat(quote.lines()).hasSize(2).allSatisfy(line -> {
            assertThat(line.quantity()).isEqualByComparingTo("1");
            assertThat(line.rate()).isZero();
            assertThat(line.amount()).isZero();
        });
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        assertThat(transaction.execute(status -> service.publicQuote(token(shared.publicUrl()), "ClientPassword123")).quote().pricingMode()).isEqualTo("TOTAL_PRICE");
        try (var pdf = Loader.loadPDF(service.publicPdf(token(shared.publicUrl()), "ClientPassword123"))) {
            var text = new org.apache.pdfbox.text.PDFTextStripper().getText(pdf);
            assertThat(text).contains("Repair pump", "Test installation", "$1130.00").doesNotContain("QTY", "RATE", "$0.00");
        }
        transaction.execute(status -> service.decide(token(shared.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Client", "Approved")));
        assertThatThrownBy(() -> transaction.execute(status -> service.update(tenant, actor, quote.id(), totalPriceRequest("TOTAL_PRICE", "2000"))))
                .hasMessageContaining("Only draft or declined");
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET pricing_mode = 'ITEMIZED' WHERE id = ?", quote.id())).hasMessageContaining("locked");
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET template_name = 'Other' WHERE id = ?", quote.id())).hasMessageContaining("locked");
        var propertyId = UUID.randomUUID();
        jdbc.update("INSERT INTO properties(id, tenant_id, name) VALUES (?, ?, 'Operational property')", propertyId, tenant);
        when(workOrders.createFromQuote(eq(tenant), eq(actor), any())).thenAnswer(invocation -> {
            var id = UUID.randomUUID();
            jdbc.update("INSERT INTO work_orders(id, tenant_id, work_order_number) VALUES (?, ?, '261015-0001')", id, tenant);
            return new QuoteWorkOrderResult(id, "261015-0001");
        });
        assertThat(transaction.execute(status -> service.convert(tenant, actor, quote.id(), propertyId)).total()).isEqualByComparingTo("1130");
        var converted = ArgumentCaptor.forClass(com.lorne.platform.workorder.QuoteWorkOrderRequest.class);
        verify(workOrders).createFromQuote(eq(tenant), eq(actor), converted.capture());
        assertThat(converted.getValue().description()).contains("Repair pump", "Test installation", "1130").doesNotContain("(1");
    }

    @Test
    void savedTemplateSnapshotsSurviveRenamingAndUnassignment() {
        var original = transaction.execute(status -> service.create(tenant, actor, request));
        var configured = transaction.execute(status -> quoteTemplates.configure(actor, "ITEMIZED",
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Configure("Detailed estimate", "Default note", "Default terms", 0)));
        assertThat(configured.version()).isEqualTo(1);
        assertThatThrownBy(() -> transaction.execute(status -> quoteTemplates.configure(actor, "ITEMIZED",
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Configure("Stale edit", null, null, 0))))
                .hasMessageContaining("changed");
        var fresh = transaction.execute(status -> service.create(tenant, actor, request));
        assertThat(fresh.templateName()).isEqualTo("Detailed estimate");
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("TOTAL_PRICE"), "TOTAL_PRICE")));
        var updated = transaction.execute(status -> service.update(tenant, actor, original.id(), request));
        assertThat(updated.templateName()).isEqualTo("Itemized quote");
        assertThat(updated.pricingMode()).isEqualTo("ITEMIZED");
        assertThatThrownBy(() -> transaction.execute(status -> service.create(tenant, actor, request)))
                .hasMessageContaining("total price");
    }

    @Test
    void validatesTotalPriceAndItemizedRounding() {
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("ITEMIZED", "TOTAL_PRICE"), "ITEMIZED")));
        for (var total : List.of("-1", "10000000000")) {
            assertThatThrownBy(() -> transaction.execute(status -> service.create(tenant, actor, totalPriceRequest("TOTAL_PRICE", total))))
                    .isInstanceOf(BadRequestException.class);
        }
        var rounded = new UpsertQuoteRequest(null, "Client", null, null, null, null, null, null, "Rounding", null,
                null, null, BigDecimal.ZERO, null, null, List.of(
                new UpsertQuoteRequest.Line(null, "First", new BigDecimal(".33"), null, new BigDecimal(".10")),
                new UpsertQuoteRequest.Line(null, "Second", new BigDecimal(".33"), null, new BigDecimal(".10"))));
        var quote = transaction.execute(status -> service.create(tenant, actor, rounded));
        assertThat(quote.subtotal()).isEqualByComparingTo(".06");
        assertThat(quote.lines().stream().map(line -> line.amount()).reduce(BigDecimal.ZERO, BigDecimal::add))
                .isEqualByComparingTo(quote.subtotal());
    }

    @Test
    void templateMigrationBackfillsWithoutChangingApprovedPricesOrDecisions() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        transaction.execute(status -> service.decide(token(shared.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Client", "Accepted")));
        jdbc.execute("DROP TRIGGER tenants_initial_quote_template ON tenants");
        jdbc.execute("DROP FUNCTION assign_initial_quote_template()");
        jdbc.execute("ALTER TABLE quotes DROP COLUMN template_code, DROP COLUMN template_name, DROP COLUMN pricing_mode");
        jdbc.execute("DROP TABLE tenant_quote_templates");
        jdbc.execute("DROP TABLE quote_templates");
        jdbc.execute(Files.readString(Path.of("../../../db-migration/src/main/resources/db/migration/postgresql/V85__quote_pricing_templates.sql")));
        var preserved = service.get(tenant, quote.id());
        assertThat(preserved.status()).isEqualTo("APPROVED");
        assertThat(preserved.approvalName()).isEqualTo("Client");
        assertThat(preserved.total()).isEqualByComparingTo(quote.total());
        assertThat(preserved.templateCode()).isEqualTo("ITEMIZED");
        assertThat(quoteTemplates.assignment(tenant).defaultCode()).isEqualTo("ITEMIZED");
        assertThatThrownBy(() -> jdbc.update("UPDATE quotes SET template_code = 'TOTAL_PRICE' WHERE id = ?", quote.id())).hasMessageContaining("locked");
    }

    @Test
    void newQuotesApplyTemplateDefaultsButAllowTenantsToClearThem() {
        transaction.execute(status -> quoteTemplates.configure(actor, "TOTAL_PRICE",
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Configure("Fixed estimate", "Default note", "Default terms", 0)));
        transaction.execute(status -> quoteTemplates.assign(tenant, actor,
                new com.lorne.platform.quote.internal.dto.QuoteTemplateDtos.Assign(List.of("TOTAL_PRICE"), "TOTAL_PRICE")));
        var omitted = totalPriceRequest(null, "100");
        var defaults = transaction.execute(status -> service.create(tenant, actor, omitted));
        assertThat(defaults.notes()).isEqualTo("Default note");
        assertThat(defaults.terms()).isEqualTo("Default terms");
        var cleared = new UpsertQuoteRequest(null, "Client", null, null, null, null, null, null, "Cleared defaults", null,
                null, null, BigDecimal.ZERO, "", "", omitted.lines(), "TOTAL_PRICE", new BigDecimal("100"));
        var empty = transaction.execute(status -> service.create(tenant, actor, cleared));
        assertThat(empty.notes()).isNull();
        assertThat(empty.terms()).isNull();
    }

    private UpsertQuoteRequest totalPriceRequest(String code, String price) {
        return new UpsertQuoteRequest(null, "Client", "client@example.com", null, null, "Site", "Address", null,
                "Overall estimate", "Work scope", null, null, new BigDecimal(".13"), null, null,
                List.of(new UpsertQuoteRequest.Line(null, "Repair pump", null, null, null),
                        new UpsertQuoteRequest.Line(null, "Test installation", null, null, null)), code, new BigDecimal(price));
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
        transaction.execute(status -> service.share(tenant, actor, quote.id(), null));
        assertThat(transaction.execute(status -> emailLogs.resend(tenant, actor, original.id(), null)).quoteId()).isEqualTo(quote.id());
        transaction.execute(status -> service.voidQuote(tenant, actor, quote.id()));
        assertThatThrownBy(() -> transaction.execute(status -> emailLogs.resend(tenant, actor, original.id(), null)))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("voided");
    }

    @Test
    void sharingSendingAndResendingKeepOneLinkAndPasswordWithoutResettingClientViews() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        transaction.execute(status -> service.publicQuote(token(shared.publicUrl()), "ClientPassword123"));
        var viewedAt = service.get(tenant, quote.id()).viewedAt();
        var passwordHash = jdbc.queryForObject("SELECT access_password_hash FROM quotes WHERE id = ?", String.class, quote.id());
        for (int i = 0; i < 3; i++) {
            var sent = transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, null)));
            assertThat(sent.publicUrl()).isEqualTo(shared.publicUrl());
            assertThat(transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123")).publicUrl()).isEqualTo(shared.publicUrl());
        }
        assertThat(service.sharing(tenant, quote.id()).publicUrl()).isEqualTo(shared.publicUrl());
        assertThat(service.sharing(tenant, quote.id()).passwordSet()).isTrue();
        assertThat(service.get(tenant, quote.id()).viewedAt()).isEqualTo(viewedAt);
        assertThat(service.get(tenant, quote.id()).status()).isEqualTo("VIEWED");
        assertThat(jdbc.queryForObject("SELECT access_password_hash FROM quotes WHERE id = ?", String.class, quote.id())).isEqualTo(passwordHash);
        assertThat(audit.list(tenant, 100, "QUOTE", quote.id()).stream().filter(event -> event.action().equals("QUOTE_SHARED")).count()).isEqualTo(1);
        assertThat(transaction.execute(status -> service.publicQuote(token(shared.publicUrl()), "ClientPassword123")).quote().id()).isEqualTo(quote.id());
    }

    @Test
    void migrationRecoversOnlyTheCurrentEmailLinkAndLegacyManualLinksRecoverOnAccess() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var sent = transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, "ClientPassword123")));
        jdbc.update("INSERT INTO email_delivery_logs(id, tenant_id, quote_id, body, created_at) VALUES (?, ?, ?, ?, now() + interval '1 minute')",
                UUID.randomUUID(), tenant, quote.id(), "Old link /quote-response/" + "A".repeat(43));
        jdbc.execute("DROP TABLE quote_share_links");
        jdbc.execute(Files.readString(Path.of("../../../db-migration/src/main/resources/db/migration/postgresql/V79__stable_quote_share_links.sql")));
        assertThat(service.sharing(tenant, quote.id()).publicUrl()).isEqualTo(sent.publicUrl());
        assertThat(transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, null))).publicUrl()).isEqualTo(sent.publicUrl());
        jdbc.update("DELETE FROM quote_share_links WHERE quote_id = ?", quote.id());
        assertThatThrownBy(() -> transaction.execute(status -> service.share(tenant, actor, quote.id(), null)))
                .hasMessageContaining("Open the existing shared link once");
        transaction.execute(status -> service.publicQuote(token(sent.publicUrl()), "ClientPassword123"));
        assertThat(transaction.execute(status -> service.share(tenant, actor, quote.id(), null)).publicUrl()).isEqualTo(sent.publicUrl());
    }

    @Test
    void linkLastsThroughValidityDateAndBlocksAllPublicAccessAfterExpiryOrVoid() {
        var todayRequest = new UpsertQuoteRequest(request.customerId(), request.adhocCustomerName(), request.adhocCustomerEmail(), request.adhocCustomerPhone(),
                request.propertyId(), request.adhocPropertyName(), request.adhocPropertyAddress(), request.serviceTypeId(),
                request.title(), request.scope(), LocalDate.now(), LocalDate.now(), request.taxRate(), request.notes(), request.terms(), request.lines());
        var quote = transaction.execute(status -> service.create(tenant, actor, todayRequest));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var token = token(shared.publicUrl());
        assertThat(transaction.<byte[]>execute(status -> service.publicPdf(token, "ClientPassword123"))).isNotEmpty();
        jdbc.update("UPDATE quotes SET issue_date = current_date - 2, valid_until = current_date - 1 WHERE id = ?", quote.id());
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token, "ClientPassword123"))).hasMessageContaining("expired");
        assertThatThrownBy(() -> transaction.execute(status -> service.publicPdf(token, "ClientPassword123"))).hasMessageContaining("expired");
        assertThatThrownBy(() -> transaction.execute(status -> service.decide(token, "ClientPassword123", true, new QuoteDecisionRequest("Client", "Yes")))).hasMessageContaining("expired");
        assertThatThrownBy(() -> transaction.execute(status -> service.share(tenant, actor, quote.id(), null))).hasMessageContaining("expired");
        assertThatThrownBy(() -> transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, null)))).hasMessageContaining("expired");
        assertThatThrownBy(() -> service.quoteAttachment(tenant, quote.id(), shared.publicUrl())).hasMessageContaining("expired");
        jdbc.update("UPDATE quotes SET valid_until = current_date + 1 WHERE id = ?", quote.id());
        transaction.execute(status -> service.voidQuote(tenant, actor, quote.id()));
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token, "ClientPassword123"))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> transaction.execute(status -> service.publicPdf(token, "ClientPassword123"))).isInstanceOf(ResponseStatusException.class);
        assertThat(service.sharing(tenant, quote.id()).publicUrl()).isNull();
    }

    @Test
    void revisingDeclinedQuoteKeepsCredentialsAndApprovalKeepsOriginalLinkReadable() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var token = token(shared.publicUrl());
        transaction.execute(status -> service.decide(token, "ClientPassword123", false, new QuoteDecisionRequest("Client", "Please revise")));
        transaction.execute(status -> service.update(tenant, actor, quote.id(), request));
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token, "ClientPassword123"))).hasMessageContaining("being revised");
        assertThat(transaction.execute(status -> service.share(tenant, actor, quote.id(), null)).publicUrl()).isEqualTo(shared.publicUrl());
        transaction.execute(status -> service.decide(token, "ClientPassword123", true, new QuoteDecisionRequest("Client", "Yes")));
        assertThat(transaction.execute(status -> service.publicQuote(token, "ClientPassword123")).quote().status()).isEqualTo("APPROVED");
        assertThat(transaction.<byte[]>execute(status -> service.publicPdf(token, "ClientPassword123"))).isNotEmpty();
    }

    @Test
    void openEndedQuoteAndFailedEmailKeepTheOriginalCredentials() {
        var openRequest = new UpsertQuoteRequest(request.customerId(), request.adhocCustomerName(), request.adhocCustomerEmail(), request.adhocCustomerPhone(),
                request.propertyId(), request.adhocPropertyName(), request.adhocPropertyAddress(), request.serviceTypeId(),
                request.title(), request.scope(), LocalDate.now().minusYears(1), null, request.taxRate(), request.notes(), request.terms(), request.lines());
        var quote = transaction.execute(status -> service.create(tenant, actor, openRequest));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        when(mail.send(eq(tenant), any())).thenReturn(new OutboundMailDeliveryResult("FAILED", "SMTP rejected recipient", null, "TEST", null, null));
        assertThat(transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, null))).publicUrl()).isEqualTo(shared.publicUrl());
        assertThat(transaction.execute(status -> service.publicQuote(token(shared.publicUrl()), "ClientPassword123")).quote().validUntil()).isNull();
        assertThatThrownBy(() -> transaction.execute(status -> service.send(tenant, actor, quote.id(), new SendQuoteRequest(null, null, null, "SecondPassword123"))))
                .hasMessageContaining("original password");
        assertThat(transaction.execute(status -> service.share(tenant, actor, quote.id(), null)).publicUrl()).isEqualTo(shared.publicUrl());
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

    @Test
    void siteVisitLinkIsSeparateStableAndClosesOnPublication() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var capture = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "SitePassword123"));
        assertThat(capture.publicUrl()).startsWith("https://prs.app.maplepropertyservices.ca/quote-capture/");
        var repeated = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), null));
        assertThat(repeated).isEqualTo(capture);
        assertThatThrownBy(() -> transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "DifferentPassword"))).hasMessageContaining("original password");
        var view = transaction.execute(status -> site.capture(token(capture.publicUrl()), "SitePassword123"));
        var json = new ObjectMapper().findAndRegisterModules().writeValueAsString(view);
        assertThat(json).contains("Pump replacement").doesNotContain("subtotal", "taxRate", "client@example.com", "terms", "approval_token");
        transaction.execute(status -> site.captureNote(token(capture.publicUrl()), "SitePassword123", "Estimator", "Measure the pump room."));
        var client = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        assertThat(client.publicUrl()).isNotEqualTo(capture.publicUrl());
        assertThat(site.details(tenant, quote.id()).notes()).hasSize(1);
        assertThat(site.details(tenant, quote.id()).captureLink().active()).isFalse();
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(capture.publicUrl()), "SitePassword123"))).hasMessageContaining("closed");
        assertThatThrownBy(() -> transaction.execute(status -> site.captureNote(token(capture.publicUrl()), "SitePassword123", "Estimator", "Late note"))).hasMessageContaining("closed");
        assertThatThrownBy(() -> transaction.execute(status -> service.publicQuote(token(capture.publicUrl()), "SitePassword123"))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(client.publicUrl()), "ClientPassword123"))).isInstanceOf(ResponseStatusException.class);
        var publicJson = new ObjectMapper().findAndRegisterModules().writeValueAsString(transaction.execute(status -> service.publicQuote(token(client.publicUrl()), "ClientPassword123")));
        assertThat(publicJson).doesNotContain("Measure the pump room", "SitePassword", "quote-capture");
        assertThat(audit.list(tenant, 100, "QUOTE", quote.id()).stream().map(entry -> entry.action()))
                .contains("QUOTE_CAPTURE_LINK_CREATED", "QUOTE_SITE_VISIT_OPENED", "QUOTE_SITE_NOTE_ADDED");
    }

    @Test
    void clientOnlySeesPublishedVisiblePhotosAndApprovalLocksAttachments() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var capture = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "SitePassword123"));
        var visible = transaction.execute(status -> site.capturePhoto(token(capture.publicUrl()), "SitePassword123", testPhoto(), "Pump location", true, "Estimator"));
        var internal = transaction.execute(status -> site.upload(tenant, actor, quote.id(), testPhoto(), "Internal condition", false, "Admin"));
        assertThat(site.details(tenant, quote.id()).photos()).hasSize(2);
        transaction.executeWithoutResult(status -> site.updatePhoto(tenant, actor, quote.id(), visible.id(), "Pump location revised", true));
        transaction.execute(status -> site.addNote(tenant, actor, quote.id(), "Admin", "Private inspection note"));
        var shared = transaction.execute(status -> service.share(tenant, actor, quote.id(), "ClientPassword123"));
        var photos = transaction.execute(status -> site.clientPhotos(token(shared.publicUrl()), "ClientPassword123"));
        assertThat(photos).hasSize(1); assertThat(photos.getFirst().caption()).isEqualTo("Pump location revised");
        assertThat(transaction.execute(status -> site.clientPhoto(token(shared.publicUrl()), "ClientPassword123", visible.id())).bytes()).isNotEmpty();
        assertThatThrownBy(() -> transaction.execute(status -> site.clientPhoto(token(shared.publicUrl()), "ClientPassword123", internal.id()))).hasMessageContaining("not found");
        assertThatThrownBy(() -> transaction.execute(status -> site.upload(tenant, actor, quote.id(), testPhoto(), "Late", true, "Admin"))).hasMessageContaining("closed");
        transaction.execute(status -> service.decide(token(shared.publicUrl()), "ClientPassword123", true, new QuoteDecisionRequest("Client", "Yes")));
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> site.updatePhoto(tenant, actor, quote.id(), visible.id(), "Changed", false))).hasMessageContaining("closed");
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> site.deletePhoto(tenant, actor, quote.id(), visible.id()))).hasMessageContaining("closed");
        assertThatThrownBy(() -> jdbc.update("UPDATE quote_photos SET client_visible = false WHERE id = ?", visible.id())).hasMessageContaining("locked");
        assertThatThrownBy(() -> jdbc.update("DELETE FROM quote_site_notes WHERE quote_id = ?", quote.id())).hasMessageContaining("locked");
        var approvedPhotos = transaction.execute(status -> site.clientPhotos(token(shared.publicUrl()), "ClientPassword123"));
        assertThat(approvedPhotos).hasSize(1);
    }

    @Test
    void capturePasswordLockoutRevocationExpiryAndModuleGateAreEnforced() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var capture = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "SitePassword123"));
        for (int i = 0; i < 5; i++) assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(capture.publicUrl()), "wrong"))).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(capture.publicUrl()), "SitePassword123"))).hasMessageContaining("Too many attempts");
        jdbc.update("UPDATE quote_capture_links SET locked_until = NULL, failed_attempts = 0 WHERE quote_id = ?", quote.id());
        transaction.executeWithoutResult(status -> site.revoke(tenant, actor, quote.id()));
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(capture.publicUrl()), "SitePassword123"))).hasMessageContaining("revoked");
        var renewed = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "NewSitePassword"));
        assertThat(renewed.publicUrl()).isNotEqualTo(capture.publicUrl());
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(capture.publicUrl()), "SitePassword123"))).isInstanceOf(ResponseStatusException.class);
        jdbc.update("UPDATE quote_capture_links SET expires_at = now() - interval '1 hour' WHERE quote_id = ?", quote.id());
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(renewed.publicUrl()), "NewSitePassword"))).hasMessageContaining("expired");
        jdbc.update("UPDATE quote_capture_links SET expires_at = now() + interval '1 day' WHERE quote_id = ?", quote.id());
        jdbc.update("UPDATE tenant_modules SET enabled = false WHERE tenant_id = ?", tenant);
        assertThatThrownBy(() -> transaction.execute(status -> site.capture(token(renewed.publicUrl()), "NewSitePassword"))).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> site.details(tenant, quote.id())).hasMessageContaining("not enabled");
    }

    @Test
    void sitePhotosCannotCrossQuoteOrTenantAndInvalidImagesAreRejected() throws Exception {
        var first = transaction.execute(status -> service.create(tenant, actor, request));
        var second = transaction.execute(status -> service.create(tenant, actor, request));
        var photo = transaction.execute(status -> site.upload(tenant, actor, first.id(), testPhoto(), "Site", true, "Admin"));
        assertThatThrownBy(() -> site.photo(tenant, second.id(), photo.id())).hasMessageContaining("not found");
        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> site.deletePhoto(tenant, actor, second.id(), photo.id()))).hasMessageContaining("not found");
        assertThatThrownBy(() -> site.details(UUID.randomUUID(), first.id())).hasMessageContaining("not enabled");
        assertThatThrownBy(() -> jdbc.update("UPDATE quote_photos SET quote_id = ? WHERE id = ?", second.id(), photo.id())).hasMessageContaining("ownership");
        var badDocument = UUID.randomUUID();
        jdbc.update("INSERT INTO documents(id,tenant_id,owner_type,owner_id) VALUES (?, ?, 'QUOTE', ?)", badDocument, tenant, second.id());
        assertThatThrownBy(() -> jdbc.update("INSERT INTO quote_photos(tenant_id,quote_id,document_id,author_name,source) VALUES (?, ?, ?, 'Admin', 'TENANT_PORTAL')", tenant, first.id(), badDocument)).hasMessageContaining("does not belong");
        var bad = new org.springframework.mock.web.MockMultipartFile("file", "evil.svg", "image/svg+xml", "<svg onload='alert(1)'/>".getBytes());
        assertThatThrownBy(() -> transaction.execute(status -> site.upload(tenant, actor, first.id(), bad, "", true, "Admin"))).hasMessageContaining("JPG or PNG");
        var normalized = QuoteSiteVisitService.normalizedPhoto(testPhoto());
        assertThat(javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(normalized)).getWidth()).isEqualTo(20);
        transaction.executeWithoutResult(status -> site.deletePhoto(tenant, actor, first.id(), photo.id()));
        verify(storage).deleteQuotePhoto(eq(tenant), eq(first.id()), any());
        assertThat(site.details(tenant, first.id()).photos()).isEmpty();
    }

    @Test
    void captureLimitsAndVoidingAreEnforced() throws Exception {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var capture = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "SitePassword123"));
        jdbc.update("""
                INSERT INTO quote_site_notes(tenant_id,quote_id,author_name,body,source)
                SELECT ?, ?, 'Admin', 'Note', 'TENANT_PORTAL' FROM generate_series(1,100)
                """, tenant, quote.id());
        assertThatThrownBy(() -> transaction.execute(status -> site.captureNote(token(capture.publicUrl()), "SitePassword123", "Estimator", "More"))).hasMessageContaining("100 site notes");
        assertThatThrownBy(() -> transaction.execute(status -> site.addNote(tenant, actor, quote.id(), "", "Note"))).hasMessageContaining("Your name");
        transaction.execute(status -> service.voidQuote(tenant, actor, quote.id()));
        assertThat(site.details(tenant, quote.id()).captureLink().active()).isFalse();
        assertThatThrownBy(() -> transaction.execute(status -> site.capturePhoto(token(capture.publicUrl()), "SitePassword123", testPhoto(), "", true, "Estimator"))).hasMessageContaining("closed");
    }

    private org.springframework.mock.web.MockMultipartFile testPhoto() {
        try {
            var image = new java.awt.image.BufferedImage(20, 10, java.awt.image.BufferedImage.TYPE_INT_RGB);
            var output = new java.io.ByteArrayOutputStream(); javax.imageio.ImageIO.write(image, "png", output);
            return new org.springframework.mock.web.MockMultipartFile("file", "site.png", "image/png", output.toByteArray());
        } catch (java.io.IOException exception) { throw new IllegalStateException(exception); }
    }

    @Test
    void repeatingPhotoUploadAfterLostResponseDoesNotDuplicateThePhoto() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        var capture = transaction.execute(status -> site.createLink(tenant, actor, quote.id(), "SitePassword123"));
        var uploadId = UUID.randomUUID();
        var first = transaction.execute(status -> site.capturePhoto(token(capture.publicUrl()), "SitePassword123", testPhoto(), "Pump", true, "Estimator", uploadId));
        var retry = transaction.execute(status -> site.capturePhoto(token(capture.publicUrl()), "SitePassword123", testPhoto(), "Pump", true, "Estimator", uploadId));
        assertThat(retry).isEqualTo(first);
        assertThat(site.details(tenant, quote.id()).photos()).hasSize(1);
        verify(storage, org.mockito.Mockito.times(1)).storeQuotePhoto(eq(tenant), org.mockito.ArgumentMatchers.isNull(), eq(quote.id()), any(), eq("image/jpeg"));
    }

    @Test
    void photoCountIsLimitedBeforeWritingStorage() {
        var quote = transaction.execute(status -> service.create(tenant, actor, request));
        for (int i = 0; i < 30; i++) transaction.execute(status -> site.upload(tenant, actor, quote.id(), testPhoto(), "Site", true, "Admin"));
        assertThatThrownBy(() -> transaction.execute(status -> site.upload(tenant, actor, quote.id(), testPhoto(), "More", true, "Admin")))
                .hasMessageContaining("30 photos");
        assertThat(site.details(tenant, quote.id()).photos()).hasSize(30);
        verify(storage, org.mockito.Mockito.times(30)).storeQuotePhoto(any(), any(), any(), any(), any());
    }
}
