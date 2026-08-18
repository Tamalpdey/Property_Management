package com.lorne.platform.finance.internal.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.lorne.platform.finance.internal.dto.InvoiceDto;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.Test;

class InvoicePdfServiceTest {
    @Test
    void generatesReadableInvoicePdfPreview() throws Exception {
        var invoice = new InvoiceDto(
                UUID.randomUUID(),
                "INV-20260811-001",
                "DRAFT",
                LocalDate.of(2026, 8, 11),
                LocalDate.of(2026, 9, 10),
                new BigDecimal("285.00"),
                new BigDecimal("37.05"),
                new BigDecimal("322.05"),
                BigDecimal.ZERO,
                new BigDecimal("322.05"),
                UUID.randomUUID(),
                "Martin Lakeside Trust",
                "hello@martintrust.example",
                "billing@martintrust.example",
                UUID.randomUUID(),
                "WO-20260806-33A4B3",
                "Fixture replacement",
                "Bayview Pool Home",
                "22 Bayview Ridge, Mississauga, ON, L5B 2C2",
                java.time.Instant.parse("2026-08-11T10:00:00Z"),
                List.of(new InvoiceDto.InvoiceWorkOrderDto(
                        UUID.randomUUID(),
                        "WO-20260806-33A4B3",
                        "Fixture replacement",
                        "Bayview Pool Home",
                        "22 Bayview Ridge, Mississauga, ON, L5B 2C2",
                        "COMPLETED",
                        "Fixture replacement"
                )),
                List.of(
                        new InvoiceDto.InvoiceLineDto(UUID.randomUUID(), "LABOR", "Fixture replacement", BigDecimal.ONE, new BigDecimal("225.00"), new BigDecimal("225.00"), true, new BigDecimal("0.13")),
                        new InvoiceDto.InvoiceLineDto(UUID.randomUUID(), "MATERIAL", "Chlorine tablets 3 in", BigDecimal.ONE, new BigDecimal("60.00"), new BigDecimal("60.00"), true, new BigDecimal("0.13"))
                ),
                List.of()
        );

        var bytes = new InvoicePdfService(null).generate(invoice);
        assertThat(new String(bytes, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");

        var previewPath = Path.of("build", "tmp", "test-invoice-preview.pdf");
        Files.createDirectories(previewPath.getParent());
        Files.write(previewPath, bytes);

        try (var document = Loader.loadPDF(bytes)) {
            var renderer = new PDFRenderer(document);
            var page = renderer.renderImageWithDPI(0, 96);
            ImageIO.write(page, "png", previewPath.resolveSibling("test-invoice-preview.png").toFile());
        }
    }
}
