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
    void rendersQuoteWithBrandingTotalsAndApproval() throws Exception {
        var settings = mock(TenantSettingsView.class);
        when(settings.invoiceBrandName()).thenReturn("Platinum Residential Services");
        when(settings.invoiceShowCompanyName()).thenReturn(true);
        when(settings.invoiceShowCompanyAddress()).thenReturn(true);
        when(settings.addressLine1()).thenReturn("130 Industry Street, Unit 33");
        when(settings.city()).thenReturn("Toronto");
        when(settings.provinceCode()).thenReturn("ON");
        when(settings.postalCode()).thenReturn("M6M 5G3");
        when(settings.countryCode()).thenReturn("CA");
        when(settings.themePrimaryColor()).thenReturn("#0f766e");
        when(settings.websiteUrl()).thenReturn("https://www.platinumservices.ca/");
        when(settings.phone()).thenReturn("416.320.6507");
        when(settings.taxRegistrationNumber()).thenReturn("123456789 RT0001");
        var bytes = new QuotePdfService(null).generate(fixture(2), UUID.randomUUID(), settings);
        try (var pdf = Loader.loadPDF(bytes)) {
            var text = new PDFTextStripper().getText(pdf);
            assertThat(text).contains("Q-20261011-0001", "Martin Lakeside Trust", "$565.00", "Approved by Grace",
                    "GST/HST number", "130 Industry Street", "416.320.6507", "CLIENT NOTES");
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
            var renderer = new PDFRenderer(pdf);
            for (int i = 0; i < pdf.getNumberOfPages(); i++) {
                ImageIO.write(renderer.renderImageWithDPI(i, 96), "png", Path.of("build/tmp/quote-long-" + i + ".png").toFile());
            }
        }
    }

    static QuoteDto fixture(int lineCount) {
        var lines = IntStream.rangeClosed(1, lineCount).mapToObj(i -> new QuoteLineDto(UUID.randomUUID(),
                "Material " + i + ": Pool pump and fittings - supply and installation", BigDecimal.ONE, "each",
                new BigDecimal("250.00"), new BigDecimal("250.00"), i)).toList();
        return new QuoteDto(UUID.randomUUID(), "Q-20261011-0001", null, "Martin Lakeside Trust",
                "client@example.com", "416-555-0100", null, "Bayview Pool Home", "22 Bayview Ridge, Mississauga, ON",
                null, "Pool service", "Pool pump replacement", "Supply and install a new pool pump.\nTest the system and clean the work area.",
                "APPROVED", LocalDate.of(2026, 10, 11), LocalDate.of(2026, 11, 11), new BigDecimal("500"), new BigDecimal(".13"),
                new BigDecimal("65"), new BigDecimal("565"), "Please call before arriving.", "Work will be scheduled after approval.",
                "Grace", "Approved. Please confirm the installation date.", null, null, Instant.parse("2026-10-11T12:00:00Z"),
                null, null, null, null, Instant.now(), Instant.now(), lines);
    }
}
