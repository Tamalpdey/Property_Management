package com.lorne.platform.quote.internal.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lorne.platform.quote.internal.dto.QuoteDto;
import com.lorne.platform.quote.internal.dto.QuoteLineDto;
import com.lorne.platform.tenant.TenantSettingsView;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;

class QuotePdfServiceTest {
    @Test
    void placesCompanyAddressBelowLogoWithoutDependingOnInvoiceHeaderCheckbox() throws Exception {
        var tenant = UUID.randomUUID();
        var logoId = UUID.randomUUID();
        var storage = mock(com.lorne.platform.document.DocumentStorageService.class);
        var settings = mock(TenantSettingsView.class);
        when(settings.logoUrl()).thenReturn("/api/v1/tenant/settings/logo/" + logoId);
        when(settings.invoiceShowCompanyAddress()).thenReturn(false);
        when(settings.addressLine1()).thenReturn("130 Industry Street");
        when(settings.addressLine2()).thenReturn("Unit 33");
        when(settings.city()).thenReturn("Toronto");
        when(settings.provinceCode()).thenReturn("ON");
        when(settings.postalCode()).thenReturn("M6M 5G3");
        when(settings.themePrimaryColor()).thenReturn("#006FA6");
        when(settings.timezone()).thenReturn("America/Toronto");
        var logo = new java.awt.image.BufferedImage(220, 80, java.awt.image.BufferedImage.TYPE_INT_RGB);
        var graphics = logo.createGraphics();
        graphics.setColor(java.awt.Color.WHITE); graphics.fillRect(0, 0, 220, 80);
        graphics.setColor(new java.awt.Color(15, 118, 110)); graphics.setFont(new java.awt.Font("SansSerif", java.awt.Font.BOLD, 20));
        graphics.drawString("COMPANY LOGO", 20, 47); graphics.dispose();
        var image = new java.io.ByteArrayOutputStream(); ImageIO.write(logo, "png", image);
        when(storage.tenantLogo(tenant, logoId)).thenReturn(new com.lorne.platform.document.DocumentStorageService.StoredLogo("image/png", image.toByteArray()));
        var bytes = new QuotePdfService(storage).generate(fixture(2), tenant, settings);
        try (var pdf = Loader.loadPDF(bytes)) {
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text.substring(0, text.indexOf("PREPARED FOR"))).contains("Unit 33, 130 Industry Street", "Toronto", "M6M 5G3");
            var path = Path.of("build/tmp/quote-logo-address-preview.pdf");
            Files.createDirectories(path.getParent()); Files.write(path, bytes);
            ImageIO.write(new PDFRenderer(pdf).renderImageWithDPI(0, 120), "png", path.resolveSibling("quote-logo-address-preview.png").toFile());
        }
    }

    @Test
    void rendersQuoteWithBrandingTotalsAndApproval() throws Exception {
        var settings = mock(TenantSettingsView.class);
        when(settings.invoiceBrandName()).thenReturn("Platinum Residential Services");
        when(settings.invoiceShowCompanyName()).thenReturn(true);
        when(settings.invoiceShowCompanyAddress()).thenReturn(false);
        when(settings.addressLine1()).thenReturn("130 Industry Street, Unit 33");
        when(settings.city()).thenReturn("Toronto");
        when(settings.provinceCode()).thenReturn("ON");
        when(settings.postalCode()).thenReturn("M6M 5G3");
        when(settings.countryCode()).thenReturn("CA");
        when(settings.themePrimaryColor()).thenReturn("#0f766e");
        when(settings.websiteUrl()).thenReturn("https://www.platinumservices.ca/");
        when(settings.phone()).thenReturn("416.320.6507");
        when(settings.taxRegistrationNumber()).thenReturn("123456789 RT0001");
        when(settings.timezone()).thenReturn("America/Toronto");
        var bytes = new QuotePdfService(null).generate(fixture(2), UUID.randomUUID(), settings);
        try (var pdf = Loader.loadPDF(bytes)) {
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("261011-0001", "Martin Lakeside Trust", "$565.00", "Approved by Grace",
                    "GST/HST number", "130 Industry Street", "416.320.6507", "CLIENT NOTES", "HST (13%)", "DESCRIPTION (SCOPE OF WORK)")
                    .contains("ISSUED", "VALID UNTIL", "Oct 11, 2026", "Nov 11, 2026", "EDT")
                    .doesNotContain("QUOTE FOR", "Tax (", "Status:", "2026-10-11T12:00:00Z");
            var prepared = text.substring(text.indexOf("PREPARED FOR"), text.indexOf("PROJECT"));
            assertThat(prepared).contains("Martin Lakeside Trust", "client@example.com")
                    .doesNotContain("22 Bayview", "Bayview Pool Home", "416-555-0100");
            assertThat(text.substring(text.indexOf("PROJECT"), text.indexOf("DESCRIPTION (SCOPE OF WORK)")))
                    .contains("22 Bayview Ridge, Mississauga, ON", "Pool pump replacement");
            var headerEdges = new java.util.HashMap<String, Float>();
            new PDFTextStripper() {
                @Override protected void writeString(String value, List<org.apache.pdfbox.text.TextPosition> positions) throws java.io.IOException {
                    if (value.equals("QUOTE") || value.equals("261011-0001")) {
                        var last = positions.getLast();
                        headerEdges.put(value, last.getXDirAdj() + last.getWidthDirAdj());
                    }
                    super.writeString(value, positions);
                }
            }.getText(pdf);
            assertThat(headerEdges.get("QUOTE")).isCloseTo(558f, org.assertj.core.data.Offset.offset(.2f));
            assertThat(headerEdges.get("261011-0001")).isCloseTo(558f, org.assertj.core.data.Offset.offset(.2f));
            var blocks = new java.util.HashMap<String, org.apache.pdfbox.text.TextPosition>();
            new PDFTextStripper() {
                @Override protected void writeString(String value, List<org.apache.pdfbox.text.TextPosition> positions) throws java.io.IOException {
                    var characters = positions.stream().map(org.apache.pdfbox.text.TextPosition::getUnicode).collect(java.util.stream.Collectors.joining());
                    for (var label : List.of("PREPARED FOR", "PROJECT", "ISSUED", "VALID UNTIL", "CLIENT NOTES", "Subtotal", "TERMS", "CLIENT APPROVAL", "Oct 11, 2026", "Nov 11, 2026")) {
                        var index = characters.indexOf(label);
                        if (index >= 0) blocks.putIfAbsent(label, positions.get(index));
                    }
                    super.writeString(value, positions);
                }
            }.getText(pdf);
            assertThat(blocks.get("PREPARED FOR").getXDirAdj()).isCloseTo(42f, org.assertj.core.data.Offset.offset(.2f));
            assertThat(blocks.get("PROJECT").getXDirAdj()).isCloseTo(326f, org.assertj.core.data.Offset.offset(.2f));
            assertThat(blocks.get("PREPARED FOR").getYDirAdj()).isCloseTo(blocks.get("PROJECT").getYDirAdj(), org.assertj.core.data.Offset.offset(.2f));
            assertThat(blocks.get("VALID UNTIL").getYDirAdj() - blocks.get("ISSUED").getYDirAdj()).isCloseTo(22f, org.assertj.core.data.Offset.offset(.2f));
            assertThat(blocks.get("CLIENT NOTES").getYDirAdj()).isCloseTo(blocks.get("Subtotal").getYDirAdj(), org.assertj.core.data.Offset.offset(.2f));
            assertThat(blocks.get("Oct 11, 2026").getXDirAdj() - 480).isBetween(8f, 30f);
            assertThat(blocks.get("Nov 11, 2026").getXDirAdj() - 480).isBetween(8f, 30f);
            assertThat(blocks.get("TERMS").getYDirAdj()).isGreaterThan(650f);
            assertThat(blocks.get("TERMS").getYDirAdj()).isGreaterThan(blocks.get("CLIENT APPROVAL").getYDirAdj());
            assertThat(text.lastIndexOf("TERMS")).isGreaterThan(text.indexOf("CLIENT APPROVAL"));
            assertContentBounds(pdf);
            assertThat(pdf.getNumberOfPages()).isEqualTo(1);
            var path = Path.of("build/tmp/quote-preview.pdf");
            Files.createDirectories(path.getParent());
            Files.write(path, bytes);
            ImageIO.write(new PDFRenderer(pdf).renderImageWithDPI(0, 120), "png", path.resolveSibling("quote-preview.png").toFile());
        }
    }

    @Test
    void wrapsLongUnbrokenTextAndRepeatsTableHeadersAcrossPages() throws Exception {
        var bytes = new QuotePdfService(null).generate(fixture(70), null, null);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(pdf.getNumberOfPages()).isGreaterThan(2);
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("Material 70", "TOTAL (CAD)", "CLIENT APPROVAL", "QTY");
            assertContentBounds(pdf);
            var renderer = new PDFRenderer(pdf);
            for (int i = 0; i < pdf.getNumberOfPages(); i++) {
                ImageIO.write(renderer.renderImageWithDPI(i, 96), "png", Path.of("build/tmp/quote-long-" + i + ".png").toFile());
            }
        }
    }

    static QuoteDto fixture(int lineCount) {
        return fixture(lineCount, "ITEMIZED");
    }

    @Test
    void totalPriceLayoutWrapsAndPaginatesDescriptionsWithoutItemPrices() throws Exception {
        var bytes = new QuotePdfService(null).generate(fixture(70, "TOTAL_PRICE"), null, null);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(pdf.getNumberOfPages()).isGreaterThan(1);
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("Material 70", "TOTAL (CAD)", "$565.00", "CLIENT APPROVAL")
                    .doesNotContain("QTY", "RATE", "$0.00");
            assertContentBounds(pdf);
            var path = Path.of("build/tmp/quote-total-price-preview.pdf");
            Files.createDirectories(path.getParent());
            Files.write(path, bytes);
            var renderer = new PDFRenderer(pdf);
            for (int page = 0; page < pdf.getNumberOfPages(); page++) {
                ImageIO.write(renderer.renderImageWithDPI(page, 96), "png", path.resolveSibling("quote-total-price-" + page + ".png").toFile());
            }
            ImageIO.write(renderer.renderImageWithDPI(0, 120), "png", path.resolveSibling("quote-total-price-preview.png").toFile());
        }
    }

    static QuoteDto fixture(int lineCount, String mode) {
        return fixture(lineCount, mode, "261011-0001");
    }

    @Test
    void historicalQuoteNumbersRemainUnchangedInDownloads() throws Exception {
        var bytes = new QuotePdfService(null).generate(fixture(1, "ITEMIZED", "Q-20261011-0001"), null, null);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(new PDFTextStripper().getText(pdf)).contains("Q-20261011-0001");
        }
    }

    @Test
    void longAddressesScopeAndNotesFlowAcrossPagesWithoutClipping() throws Exception {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        var value = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(fixture(3, "TOTAL_PRICE"));
        value.put("customerName", "Cambridge Property Management and Building Services Partnership");
        value.put("customerEmail", "building-management-and-project-approval@example.com");
        value.put("propertyAddress", "2220 Weston Road, Building B, Suite 526\nToronto, ON M2R 4H9\nRear loading bay access");
        value.put("scope", "Confirm the installation requirements and protect the work area.\nReference: " + "LongReference".repeat(50));
        value.put("notes", "Coordinate access with building management before arrival.\n".repeat(40) + "END OF CLIENT NOTES");
        value.put("terms", "All changes require written approval before additional work.\n".repeat(40) + "END OF TERMS");
        var quote = mapper.treeToValue(value, QuoteDto.class);
        var bytes = new QuotePdfService(null).generate(quote, null, null);
        try (var pdf = Loader.loadPDF(bytes)) {
            assertThat(pdf.getNumberOfPages()).isGreaterThan(2);
            assertThat(new PDFTextStripper().getText(pdf)).contains("END OF CLIENT NOTES", "END OF TERMS", "CLIENT APPROVAL")
                    .doesNotContain("Status:");
            assertContentBounds(pdf);
            var renderer = new PDFRenderer(pdf);
            for (int page = 0; page < pdf.getNumberOfPages(); page++) {
                ImageIO.write(renderer.renderImageWithDPI(page, 96), "png", Path.of("build/tmp/quote-expanded-" + page + ".png").toFile());
            }
        }
    }

    static QuoteDto fixture(int lineCount, String mode, String number) {
        var lines = IntStream.rangeClosed(1, lineCount).mapToObj(i -> new QuoteLineDto(UUID.randomUUID(),
                "Material " + i + ": Pool pump and fittings - supply and installation", BigDecimal.ONE, "each",
                new BigDecimal("250.00"), new BigDecimal("250.00"), i)).toList();
        return new QuoteDto(UUID.randomUUID(), number, null, "Martin Lakeside Trust",
                "client@example.com", "416-555-0100", null, "Bayview Pool Home", "22 Bayview Ridge, Mississauga, ON",
                null, "Pool service", "Pool pump replacement", "Supply and install a new pool pump.\nTest the system and clean the work area.",
                "APPROVED", LocalDate.of(2026, 10, 11), LocalDate.of(2026, 11, 11), new BigDecimal("500"), new BigDecimal(".13"),
                new BigDecimal("65"), new BigDecimal("565"), "Please call before arriving.", "Work will be scheduled after approval.",
                "Grace", "Approved. Please confirm the installation date.", null, null, Instant.parse("2026-10-11T12:00:00Z"),
                null, null, null, null, Instant.now(), Instant.now(), lines, mode, "ITEMIZED".equals(mode) ? "Itemized quote" : "Total price quote", mode);
    }

    private static void assertContentBounds(org.apache.pdfbox.pdmodel.PDDocument pdf) throws Exception {
        new PDFTextStripper() {
            @Override protected void processTextPosition(org.apache.pdfbox.text.TextPosition position) {
                assertThat(position.getXDirAdj()).isGreaterThanOrEqualTo(41f);
                assertThat(position.getXDirAdj() + position.getWidthDirAdj()).isLessThanOrEqualTo(571f);
                assertThat(position.getYDirAdj()).isBetween(20f, 760f);
                super.processTextPosition(position);
            }
        }.getText(pdf);
    }
}
